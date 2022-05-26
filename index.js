import cors from 'cors';
import express from 'express';
import admin from 'firebase-admin';
import functions from 'firebase-functions';
import got from 'got';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { applyMappings, applyToken } from './utils.js';

const TOKEN_LIFE_TIME = 60; // minutes
const FAKE_REFERER = 'http://arcgisproxy';
const TOKEN_REFRESH_BUFFER = 1000 * 60 * 5; // 5 minutes in milliseconds

function isTokenExpired(expires) {
  return expires + TOKEN_REFRESH_BUFFER < Date.now();
}

export default function init({ arcgisServer, app, mappings }) {
  if (!app) {
    app = express();
  }

  app.use(cors());

  admin.initializeApp();

  let tokenInfo; // todo: store this in redis/datastore?
  async function getToken() {
    if (tokenInfo && !isTokenExpired(tokenInfo.expires)) {
      functions.logger.log('returning cached token');

      return tokenInfo.token;
    }

    functions.logger.log('requesting new token');
    try {
      const response = await got
        .post(`${arcgisServer.host}/arcgis/tokens/generateToken`, {
          form: {
            username: arcgisServer.username,
            password: arcgisServer.password,
            f: 'json',
            client: 'referer',
            referer: FAKE_REFERER,
            expiration: TOKEN_LIFE_TIME,
          },
        })
        .json();

      tokenInfo = response;

      return response.token;
    } catch (error) {
      functions.logger.error(error);

      throw error;
    }
  }

  const options = {
    target: arcgisServer.host,
    changeOrigin: true,
    pathRewrite: async (path) => {
      const mappedPath = applyMappings(path, mappings);

      return applyToken(mappedPath, await getToken());
    },
    logger: functions.logger,
    onProxyReq: (proxyReq) => {
      // Clear authorization header so that the firebase token isn't sent to ArcGIS Server. This caused a 403 response.
      proxyReq.setHeader('Authorization', null);
      proxyReq.setHeader('Referer', FAKE_REFERER);
    },
  };

  const validateFirebaseIdToken = async (request, response, next) => {
    functions.logger.log('Check if request is authorized with Firebase ID token');

    if (!request.headers.authorization || !request.headers.authorization.startsWith('Bearer ')) {
      functions.logger.error(
        'No Firebase ID token was passed as a Bearer token in the Authorization header.',
        'Make sure you authorize your request by providing the following HTTP header:',
        'Authorization: Bearer <Firebase ID Token>'
      );
      response.status(403).send('Unauthorized');

      return;
    }

    const idToken = request.headers.authorization.split('Bearer ')[1];

    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      request.user = decodedIdToken;
      next();

      return;
    } catch (error) {
      functions.logger.error('Error while verifying Firebase ID token:', error);
      response.status(403).send('Unauthorized');

      return;
    }
  };

  app.use(validateFirebaseIdToken);
  app.use(createProxyMiddleware(options));

  return app;
}

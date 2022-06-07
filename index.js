import { Firestore } from '@google-cloud/firestore';
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
  return expires - TOKEN_REFRESH_BUFFER < Date.now();
}

const firestore = new Firestore();

export default function init({ arcgisServer, app, mappings }) {
  if (!app) {
    app = express();
  }

  app.use(cors());

  admin.initializeApp();

  async function getToken() {
    const doc = firestore.doc('tokens/arcgis');
    const snapshot = await doc.get();
    const data = snapshot.data();

    if (snapshot.exists && !isTokenExpired(data.expires)) {
      functions.logger.debug('returning cached token');

      return data.token;
    }

    functions.logger.debug('requesting new token');
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

      await doc.set(response);

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
    if (!request.headers.authorization || !request.headers.authorization.startsWith('Bearer ')) {
      const errorMessage = `No Firebase access token was passed as a Bearer token in the Authorization header.
        Make sure you authorize your request by providing the following HTTP header:
        Authorization: Bearer <Firebase Access Token>`;
      functions.logger.error(errorMessage);
      response.status(403).send(errorMessage);

      return;
    }

    const idToken = request.headers.authorization.split('Bearer ')[1];

    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      request.user = decodedIdToken;
      next();

      return;
    } catch (error) {
      const errorMessage = 'Error while verifying Firebase access token:';
      functions.logger.error(errorMessage, error);
      response.status(403).send(errorMessage);

      return;
    }
  };

  app.use(validateFirebaseIdToken);
  app.use(createProxyMiddleware(options));

  return app;
}

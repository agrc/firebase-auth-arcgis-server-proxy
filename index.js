import cors from 'cors';
import express from 'express';
import admin from 'firebase-admin';
import functions from 'firebase-functions';
import got from 'got';
import { createProxyMiddleware } from 'http-proxy-middleware';

const TOKEN_LIFE_TIME = 60; // seconds
const TOKEN_REFRESH_BUFFER = 1000 * 60 * 5; // 5 minutes in milliseconds
const FAKE_REFERER = 'http://arcgisproxy';

export default function init({ arcgisServer, app, mappings }) {
  if (!app) {
    app = express();
  }

  app.use(cors());

  admin.initializeApp();

  let tokenInfo; // todo: store this in redis/datastore?
  async function getToken() {
    functions.logger.log('requesting new token');

    try {
      const response = await got
        .post('https://mapserv.utah.gov/arcgis/tokens/generateToken', {
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

      return response;
    } catch (error) {
      functions.logger.error(error);

      throw error;
    }
  }

  function isTokenExpired(expires) {
    return expires + TOKEN_REFRESH_BUFFER < Date.now();
  }

  async function pathRewrite(path) {
    let newPath;
    mappings.forEach(([from, to]) => {
      newPath = path.replace(from, to);
    });

    if (!tokenInfo || isTokenExpired(tokenInfo.expires)) {
      tokenInfo = await getToken();
    }

    const uri = new URL(newPath, 'http://dummy');
    const params = new URLSearchParams(uri.search);
    params.append('token', tokenInfo.token);

    return `${uri.pathname}?${params}`;
  }

  const options = {
    target: arcgisServer.host,
    changeOrigin: true,
    pathRewrite,
    logger: functions.logger,
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader('Referer', FAKE_REFERER);
      proxyReq.setHeader('Authorization', null);
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
      functions.logger.log('ID Token correctly decoded', decodedIdToken);
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

import { Firestore } from '@google-cloud/firestore';
import cors from 'cors';
import debug from 'debug';
import express from 'express';
import admin from 'firebase-admin';
import functions from 'firebase-functions';
import got from 'got';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fixRequestBody } from './fix-request-body.js';
import { applyMappings, applyToken, getUniqueSecretNames } from './utils.js';

const TOKEN_LIFE_TIME = 60; // minutes
const FAKE_REFERER = 'http://arcgisproxy';
const TOKEN_REFRESH_BUFFER = 1000 * 60 * 5; // 5 minutes in milliseconds

function isTokenExpired(expires) {
  return expires - TOKEN_REFRESH_BUFFER < Date.now();
}

const firestore = new Firestore();

export default function init({ app, mappings, host, claimsCheck, proxyOptions, verbose, appendToken = true }) {
  if (!app) {
    app = express();
  }

  app.use(cors());

  admin.initializeApp();

  async function getToken(credentials) {
    const doc = firestore.doc(`${new URL(host).host}/${credentials.username}`);
    const snapshot = await doc.get();
    const data = snapshot.data();

    if (snapshot.exists && !isTokenExpired(data.expires)) {
      functions.logger.debug('returning cached token');

      return data.token;
    }

    functions.logger.debug('requesting new token');
    try {
      const response = await got
        .post(`${host}/arcgis/tokens/generateToken`, {
          form: {
            username: credentials.username,
            password: credentials.password,
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
    target: host,
    changeOrigin: true,
    pathRewrite: async (path) => {
      const [mappedPath, credentials] = applyMappings(path, mappings, appendToken);

      if (appendToken) {
        return applyToken(mappedPath, await getToken(credentials));
      } else {
        return mappedPath;
      }
    },
    logProvider: () => functions.logger,
    logLevel: 'debug',
    onProxyReq: (proxyRequest, request) => {
      proxyRequest.removeHeader('authorization');
      proxyRequest.setHeader('referer', FAKE_REFERER);
      functions.logger.debug('pre-write headers', proxyRequest.getHeaders());
      fixRequestBody(proxyRequest, request);

      if (verbose) {
        functions.logger.debug('outgoing request to target server', {
          method: proxyRequest.method,
          path: proxyRequest.path,
          headers: proxyRequest.getHeaders(),
          body: proxyRequest.body,
        });

        functions.logger.debug('incoming request', {
          method: request.method,
          path: request.path,
          headers: request.headers,
          body: request.body,
        });
      }
    },
    onProxyRes: (proxyResponse) => {
      if (verbose) {
        functions.logger.debug('response from target server', {
          method: proxyResponse.method,
          path: proxyResponse.path,
          headers: proxyResponse.headers,
          statusCode: proxyResponse.statusCode,
        });
      }
    },
    onError: (error) => {
      functions.logger.error(error);
    },
    ...proxyOptions,
  };

  const validateFirebaseIdToken = async (request, response, next) => {
    if (!request.headers.authorization || !request.headers.authorization.slice(7)) {
      const errorMessage = `No Firebase access token was passed as a Bearer token in the Authorization header.
        Make sure you authorize your request by providing the following HTTP header:
        Authorization: Bearer <Firebase Access Token>`;
      functions.logger.error(errorMessage);

      return response.status(403).send(errorMessage);
    }

    const idToken = request.headers.authorization.slice(7);

    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);

      if (!claimsCheck || claimsCheck(decodedIdToken)) {
        request.user = decodedIdToken;

        return next();
      }

      return response.status(403).send('Unauthorized: claims check failed');
    } catch (error) {
      const errorMessage = 'Error while verifying Firebase access token';
      functions.logger.error(errorMessage, error);

      return response.status(403).send(errorMessage);
    }
  };

  if (verbose && !debug.enabled('http-proxy-middleware')) {
    console.log('Enabling http-proxy-middleware debug mode');
    debug.enable('http-proxy-middleware');
  }

  app.use(validateFirebaseIdToken);
  app.use(createProxyMiddleware(options));

  return [app, getUniqueSecretNames(mappings)];
}

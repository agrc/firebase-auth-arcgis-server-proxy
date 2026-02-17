# firebase-auth-arcgis-server-proxy

An authenticated Firebase function for proxying requests to ArcGIS Server services

## Example Usage

```js
import initProxy from '@ugrc/firebase-auth-arcgis-server-proxy';

const options = {
  host: 'https://my-arcgis-server.com/,
  mappings: [
    {
      from: /^\/toolbox/,
      to: '/arcgis/rest/services/Electrofishing/Toolbox/GPServer',
      secrets: 'ARCGIS_SERVER_CREDENTIALS',
    },
    {
      from: /^\/mapservice/,
      to: '/arcgis/rest/services/Electrofishing/MapService/FeatureServer',
      secrets: 'ARCGIS_SERVER_CREDENTIALS',
    },
    {
      from: /^\/reference/,
      to: '/arcgis/rest/services/Electrofishing/Reference/MapServer',
      secrets: 'ARCGIS_SERVER_CREDENTIALS',
    },
  ],
  claimsCheck: (claims) => {
    if (process.env.FUNCTIONS_EMULATOR) {
      return true;
    }

    return !!claims.firebase?.sign_in_attributes?.customClaim;
  },
};

const [proxy, secrets] = initProxy(options);

export const maps = functions.runWith({ secrets }).https.onRequest(proxy);
```

`host` and `mappings` are required but `checkClaims` is optional. `secrets` must match the name of a [Firebase Functions secret](https://firebase.google.com/docs/functions/config-env#create-secret).

Set option `verbose: true` to turn on verbose logging.

## Attribution

This project was developed with the assistance of [GitHub Copilot](https://github.com/features/copilot).

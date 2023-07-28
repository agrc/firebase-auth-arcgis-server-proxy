import * as querystring from 'querystring';

/**
 * Fix proxied body if bodyParser is involved.
 *
 * proxyReq: http.ClientRequest
 */
export function fixRequestBody(proxyReq, req) {
  const requestBody = req.body;

  if (!requestBody) {
    return;
  }

  const contentType = proxyReq.getHeader('Content-Type');
  const writeBody = (bodyData) => {
    proxyReq.removeHeader('Content-Length');

    // this automatically adds the transfer-encoding header which is incompatible with the content-length header
    // The NSX load balancer was rejecting these requests with both headers present.
    proxyReq.write(bodyData);
    proxyReq.end();
  };

  if (contentType && contentType.includes('application/json')) {
    writeBody(JSON.stringify(requestBody));
  }

  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    writeBody(querystring.stringify(requestBody));
  }
}

import { applyMappings, applyToken } from './utils.js';

describe('applyMappings', () => {
  it('applies appropriate replacements', () => {
    const mappings = [
      [/^\/service1/, '/arcgis/rest/services/BBEcon/MapService/MapServer'],
      [/^\/service2/, '/arcgis/rest/services/DEQEnviro/MapService/MapServer'],
      [/^\/secured/, '/arcgis/rest/services/DEQEnviro/Secure/MapServer'],
    ];

    expect(applyMappings('/service1/0/query', mappings)).toBe(
      '/arcgis/rest/services/BBEcon/MapService/MapServer/0/query'
    );
    expect(applyMappings('/service2', mappings)).toBe('/arcgis/rest/services/DEQEnviro/MapService/MapServer');
    expect(applyMappings('/secured?f=json', mappings)).toBe('/arcgis/rest/services/DEQEnviro/Secure/MapServer?f=json');
    const path = '/service1';
    expect(applyMappings(path, mappings)).not.toBe(path);
  });
});

describe('applyToken', () => {
  it('adds the token to the query string', () => {
    expect(applyToken('/service?f=json', 'token')).toBe('/service?f=json&token=token');
    expect(applyToken('/service?f=json&another=test', 'token')).toBe('/service?f=json&another=test&token=token');
    expect(applyToken('/service', 'token')).toBe('/service?token=token');
  });
});

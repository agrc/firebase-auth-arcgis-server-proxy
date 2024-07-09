import { applyMappings, applyToken, getUniqueSecretNames } from './utils.js';

describe('applyMappings', () => {
  it('applies appropriate replacements', () => {
    process.env.EDITOR = '{"username": "editor", "password": "editor-pass"}';
    process.env.VIEWER = '{"username": "viewer", "password": "viewer-pass"}';
    const mappings = [
      {
        from: /^\/toolbox/,
        to: '/arcgis/rest/services/Electrofishing/Toolbox/GPServer',
        secrets: 'EDITOR',
      },
      {
        from: /^\/mapservice/,
        to: '/arcgis/rest/services/Electrofishing/MapService/FeatureServer',
        secrets: 'VIEWER',
      },
      {
        from: /^\/reference/,
        to: '/arcgis/rest/services/Electrofishing/Reference/MapServer',
        secrets: 'EDITOR',
      },
    ];

    expect(applyMappings('/toolbox/0/query', mappings)).toEqual([
      '/arcgis/rest/services/Electrofishing/Toolbox/GPServer/0/query',
      { username: 'editor', password: 'editor-pass' },
    ]);
    expect(applyMappings('/mapservice/0/query?f=json', mappings)).toEqual([
      '/arcgis/rest/services/Electrofishing/MapService/FeatureServer/0/query?f=json',
      { username: 'viewer', password: 'viewer-pass' },
    ]);
    delete process.env.EDITOR;
    delete process.env.VIEWER;
  });

  it('throws an error if no mapping is found', () => {
    expect(() => applyMappings('/not-found', [])).toThrowError('No mapping found for path: /not-found');
  });

  it('throws an error if no environment variable is defined', () => {
    const mappings = [
      {
        from: /^\/toolbox/,
        to: '/arcgis/rest/services/Electrofishing/Toolbox/GPServer',
        secrets: 'EDITOR',
      },
    ];

    expect(() => applyMappings('/toolbox/0/query', mappings)).toThrowError(
      'No environment variable is defined for: "EDITOR"',
    );
  });

  it('throws an error if the environment variable value is invalid JSON', () => {
    process.env.EDITOR = 'invalid';
    const mappings = [
      {
        from: /^\/toolbox/,
        to: '/arcgis/rest/services/Electrofishing/Toolbox/GPServer',
        secrets: 'EDITOR',
      },
    ];

    expect(() => applyMappings('/toolbox/0/query', mappings)).toThrowError(
      'Invalid JSON in environment variable: "EDITOR"',
    );
  });
});

describe('getUniqueSecretNames', () => {
  it('returns the secrets', () => {
    const mappings = [
      {
        from: /^\/toolbox/,
        to: '/arcgis/rest/services/Electrofishing/Toolbox/GPServer',
        secrets: 'EDITOR',
      },
      {
        from: /^\/mapservice/,
        to: '/arcgis/rest/services/Electrofishing/MapService/FeatureServer',
        secrets: 'VIEWER',
      },
      {
        from: /^\/reference/,
        to: '/arcgis/rest/services/Electrofishing/Reference/MapServer',
        secrets: 'EDITOR',
      },
    ];

    expect(getUniqueSecretNames(mappings)).toEqual(['EDITOR', 'VIEWER']);
  });
});

describe('applyToken', () => {
  it('adds the token to the query string', () => {
    expect(applyToken('/service?f=json', 'token')).toBe('/service?f=json&token=token');
    expect(applyToken('/service?f=json&another=test', 'token')).toBe('/service?f=json&another=test&token=token');
    expect(applyToken('/service', 'token')).toBe('/service?token=token');
  });
});

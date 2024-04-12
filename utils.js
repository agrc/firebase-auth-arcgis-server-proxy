export function applyMappings(path, mappings) {
  let variableName;
  for (const { from, to, secrets } of mappings) {
    if (from.test(path)) {
      variableName = secrets;
      path = path.replace(from, to);

      break;
    }
  }

  if (!variableName) {
    throw new Error(`No mapping found for path: ${path}`);
  }

  if (!process.env[variableName]) {
    throw new Error(`No environment variable is defined for: "${variableName}"`);
  }

  let credentials;
  try {
    credentials = JSON.parse(process.env[variableName]);
  } catch {
    throw new Error(`Invalid JSON in environment variable: "${variableName}"`);
  }

  return [path.toString(), credentials];
}

export function applyToken(path, token) {
  const uri = new URL(path, 'http://dummy');
  const params = new URLSearchParams(uri.search);
  params.append('token', token);

  return `${uri.pathname}?${params}`;
}

export function getUniqueSecretNames(mappings) {
  return [...new Set(mappings.map(({ secrets }) => secrets))];
}

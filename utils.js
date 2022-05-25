export function applyMappings(path, mappings) {
  mappings.forEach(([from, to]) => {
    path = path.replace(from, to);
  });

  return path.toString();
}

export function applyToken(path, token) {
  const uri = new URL(path, 'http://dummy');
  const params = new URLSearchParams(uri.search);
  params.append('token', token);

  return `${uri.pathname}?${params}`;
}

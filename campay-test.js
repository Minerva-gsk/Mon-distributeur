(async () => {
  const t = await fetch(process.env.CAMPAY_URL + '/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.CAMPAY_USER, password: process.env.CAMPAY_PASS })
  });
  const tj = await t.json().catch(() => ({}));
  console.log(tj.token ? 'Jeton OK' : 'Échec du jeton, code ' + t.status);
})();

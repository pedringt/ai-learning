export default function handler(request, response) {
  const productionApi = 'https://state-api-6waw.onrender.com';
  const stagingApi = 'https://state-api-staging.onrender.com';
  const configured = process.env.STATE_API_BASE;
  const apiBase = configured || (process.env.VERCEL_ENV === 'production' ? productionApi : stagingApi);

  response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).send(`window.STATE_API_BASE=${JSON.stringify(apiBase)};`);
}

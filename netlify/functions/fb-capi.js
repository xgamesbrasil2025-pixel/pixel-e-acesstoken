// Função serverless (Netlify) que recebe o evento do site e manda pro Facebook
// via Conversions API, com o IP e o user-agent capturados no servidor.

const crypto = require('crypto');

function hashValue(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

// Telefone precisa ser normalizado (só dígitos, com código do país) antes do hash
function hashPhone(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return undefined;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const PIXEL_ID = process.env.FB_PIXEL_ID;
  const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FB_PIXEL_ID ou FB_ACCESS_TOKEN não configurados nas variáveis de ambiente.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // IP real do visitante, capturado pelo servidor (nunca pelo navegador)
    const ip =
      event.headers['x-nf-client-connection-ip'] ||
      (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      event.headers['client-ip'] ||
      '';

    const userAgent = event.headers['user-agent'] || '';

    const payload = {
      data: [
        {
          event_name: body.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url,
          action_source: 'website',
          user_data: {
            client_ip_address: ip || undefined,
            client_user_agent: userAgent || undefined,
            fbp: body.fbp || undefined,
            fbc: body.fbc || undefined,
            external_id: hashValue(body.external_id),
            em: hashValue(body.em),
            ph: hashPhone(body.ph),
            fn: hashValue(body.fn),
            ln: hashValue(body.ln),
            ct: hashValue(body.ct),
            st: hashValue(body.st),
            zp: hashValue(body.zp),
            country: hashValue(body.country)
          },
          custom_data: body.custom_data || {}
        }
      ]
    };

    const resp = await fetch(
      `https://graph.facebook.com/v25.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await resp.json();

    return {
      statusCode: resp.ok ? 200 : 400,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

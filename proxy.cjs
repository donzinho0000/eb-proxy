// =====================================================================
//  EB-PROXY  -  proxy publico do cerebro LLM dos NPCs (Node / Render)
//
//  Substitui o proxy local (proxy.ps1 / proxy.cjs) quando o jogo e'
//  PUBLICADO: a Roblox nao fala com o seu PC, entao o proxy precisa
//  morar na internet. A chave da API continua SO aqui, nunca no jogo.
//
//  Rotas:
//    GET  /health                -> estado (aberta, nao revela nada)
//    POST /v1/chat/completions   -> repassa para a river AI (exige token)
//
//  Variaveis de ambiente:
//    RIVER_API_KEY   -> chave da river AI (secreta)
//    EB_TOKEN        -> token que o jogo manda no header x-eb-token
//    PORT            -> porta (o Render define sozinho; padrao 8787)
//    ALLOWED_MODELS  -> opcional: lista separada por virgula de modelos
//                       aceitos. Vazio = aceita qualquer um.
//
//  Sem dependencias externas (usa o fetch nativo do Node 18+).
// =====================================================================
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.RIVER_API_KEY || '';
const TOKEN = process.env.EB_TOKEN || '';
const UPSTREAM = 'https://api.river.ai/v1/chat/completions';
const MAX_BODY = 512 * 1024;
const TIMEOUT_MS = 110000;
const ALLOWED_MODELS = (process.env.ALLOWED_MODELS || '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

function log(s) {
	process.stdout.write('[' + new Date().toISOString() + '] ' + s + '\n');
}

if (!KEY) {
	console.error('ERRO: sem RIVER_API_KEY');
	process.exit(1);
}
if (!TOKEN) {
	console.error('ERRO: sem EB_TOKEN -- o proxy nao pode ficar aberto');
	process.exit(1);
}

// O Roblox le o corpo da resposta como bytes; escapar todo caractere
// nao-ASCII para \uXXXX garante que acentos cheguem intactos.
// Caracteres >126 so aparecem dentro de strings JSON, entao e' seguro.
function asciiSafe(str) {
	let out = '';
	for (const ch of str) {
		const cp = ch.codePointAt(0);
		if (cp > 126) {
			if (cp > 0xffff) {
				const v = cp - 0x10000;
				out += '\\u' + (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
				out += '\\u' + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
			} else {
				out += '\\u' + cp.toString(16).padStart(4, '0');
			}
		} else {
			out += ch;
		}
	}
	return out;
}

function send(res, code, text) {
	const body = Buffer.from(asciiSafe(text), 'latin1');
	res.writeHead(code, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': body.length,
		'Cache-Control': 'no-store',
	});
	res.end(body);
}

function tokenOk(req) {
	let given = '';
	const h = req.headers['x-eb-token'];
	const a = req.headers['authorization'];
	if (typeof h === 'string') given = h;
	else if (typeof a === 'string' && a.indexOf('Bearer ') === 0) given = a.slice(7);
	if (given.length !== TOKEN.length) return false;
	try {
		return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TOKEN));
	} catch (e) {
		return false;
	}
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (c) => {
			size += c.length;
			if (size > MAX_BODY) {
				reject(new Error('corpo grande demais'));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

const server = http.createServer(async (req, res) => {
	const t0 = Date.now();
	const url = req.url || '/';
	try {
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		if (url.indexOf('/health') === 0) {
			send(res, 200, JSON.stringify({ ok: true, ia: true, servidor: 'eb-proxy' }));
			log('GET /health 200');
			return;
		}

		if (url.indexOf('/v1/chat/completions') === 0) {
			if (!tokenOk(req)) {
				send(res, 401, JSON.stringify({ error: 'token invalido' }));
				log('POST /v1/chat/completions 401 (token)');
				return;
			}
			const raw = await readBody(req);
			let payload;
			try {
				payload = JSON.parse(raw.toString('utf8'));
			} catch (e) {
				send(res, 400, JSON.stringify({ error: 'json invalido' }));
				return;
			}
			if (ALLOWED_MODELS.length && ALLOWED_MODELS.indexOf(String(payload.model)) < 0) {
				send(res, 403, JSON.stringify({ error: 'modelo nao permitido' }));
				log('POST /v1/chat/completions 403 (modelo ' + payload.model + ')');
				return;
			}
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
			let up;
			try {
				up = await fetch(UPSTREAM, {
					method: 'POST',
					headers: {
						Authorization: 'Bearer ' + KEY,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
					signal: ctrl.signal,
				});
			} finally {
				clearTimeout(timer);
			}
			const txt = await up.text();
			send(res, up.status, txt || JSON.stringify({ error: 'resposta vazia' }));
			log('POST /v1/chat/completions -> ' + up.status + ' (' + (Date.now() - t0) + 'ms, in=' + raw.length + ')');
			return;
		}

		send(res, 404, JSON.stringify({ error: 'rota desconhecida' }));
		log(url + ' -> 404');
	} catch (e) {
		const msg = String((e && e.message) || e);
		send(res, 502, JSON.stringify({ error: msg }));
		log('ERRO ' + url + ': ' + msg);
	}
});

server.on('error', (e) => {
	log('FALHA NO SERVIDOR: ' + e.message);
	process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
	log('EB-PROXY na porta ' + PORT + ' (node ' + process.version + ')');
});

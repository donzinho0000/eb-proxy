# EB-PROXY — proxy público do cérebro dos NPCs

O `proxy.ps1`/`proxy.cjs` local só funciona no **Studio**, porque roda no seu PC.
Quando o jogo é **publicado**, o servidor é a máquina da Roblox — e ela não tem acesso
ao seu `127.0.0.1`. Este projeto é o mesmo proxy, feito para morar na internet.

A chave da API continua **só aqui**, nunca no jogo.

```
Roblox (publicado)
      |  POST https://<seu-proxy>.onrender.com/v1/chat/completions
      |       header:  x-eb-token: <EB_TOKEN>
      v
EB-PROXY (este projeto, no Render)
      |  HTTPS + Authorization: Bearer $RIVER_API_KEY
      v
https://api.river.ai/v1   (modelo deepseek-ai/DeepSeek-V4.1-Flash)
```

Sem token, o proxy **recusa** (401) — ninguém usa sua chave.

---

## Passo a passo (Render, plano free)

### 1. Subir esta pasta no GitHub

Crie um repositório (pode ser **privado**) e ponha os arquivos desta pasta na raiz dele:

```powershell
cd "roblox\proxy-publico"
git init
git add .
git commit -m "eb-proxy"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/eb-proxy.git
git push -u origin main
```

> O `.gitignore` já deixa `node_modules/`, `logs/` e `chave.txt` de fora.

### 2. Criar o serviço no Render

1. Entre em <https://render.com> e conecte sua conta do GitHub.
2. **New +** → **Blueprint** (usa o `render.yaml`) **ou** **Web Service** (configura na mão).
3. Se for pela mão, use exatamente:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node proxy.cjs`
   - **Instance Type:** Free
   - **Health Check Path:** `/health`

### 3. Variáveis de ambiente (as duas são secretas)

| Nome | Valor |
|---|---|
| `RIVER_API_KEY` | a sua chave da river AI |
| `EB_TOKEN` | o token secreto (o assistente gerou um para você) |

Opcional: `ALLOWED_MODELS` = `deepseek-ai/DeepSeek-V4.1-Flash,deepseek-ai/DeepSeek-V4.1-Flash-1017`
(se preenchido, o proxy só aceita esses modelos).

Clique em **Create Web Service** e espere o deploy.

### 4. Pegar a URL e testar

Copie a URL do topo da página (ex.: `https://eb-proxy.onrender.com`) e rode:

```powershell
.\testar.ps1 -Url "https://eb-proxy.onrender.com" -Token "SEU-EB_TOKEN"
```

O resultado esperado:
- `/health` → `{"ok":true,...}`
- chat sem token → `status: 401`
- chat com token → `HTTP 200` e um JSON com a resposta da IA

### 5. Me mandar a URL

Com a URL em mãos, o assistente troca a `PROXY` das 3 cabeças
(`Workspace.Morgana.Cerebro`, `Workspace.Joel.Cerebro`, `Workspace.Patrick.Cerebro`)
e adiciona o header `x-eb-token`. Só isso — IA, percepção e hierarquia não mudam.

---

## Avisos

- **Plano free dorme** após ~15 min sem uso. A primeira fala depois disso pode levar
  ~30–60 s (cold start). Se incomodar, use plano pago ou Fly.io/Railway.
- O proxy **só** repassa `/v1/chat/completions`. Não tem `/v1/visao` (não é usado pelas
  cabeças atuais) nem `/v1/arquivo` (evita escrita em disco no servidor).
- Nunca comite a `RIVER_API_KEY`. Ela vive só nas variáveis de ambiente do Render.
- Enquanto o proxy local (janela do `iniciar-proxy.bat`) também estiver aberto, o Studio
  continua usando o `127.0.0.1` — os dois podem conviver sem conflito.

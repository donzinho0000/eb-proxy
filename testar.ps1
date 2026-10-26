# Testa o proxy publicado. Uso:
#   .\testar.ps1 -Url "https://eb-proxy.onrender.com" -Token "SEU-TOKEN"
param(
	[Parameter(Mandatory = $true)][string]$Url,
	[Parameter(Mandatory = $true)][string]$Token
)
$base = $Url.TrimEnd('/')

"== /health =="
try {
	(Invoke-WebRequest -Uri "$base/health" -TimeoutSec 90 -UseBasicParsing).Content
} catch {
	"ERRO: $($_.Exception.Message)"
}

""
"== chat SEM token (esperado 401) =="
try {
	Invoke-WebRequest -Uri "$base/v1/chat/completions" -Method Post -Body '{}' `
		-ContentType 'application/json' -TimeoutSec 90 -UseBasicParsing | Out-Null
	"PASSOU SEM TOKEN -- RUIM, o proxy esta aberto"
} catch {
	"status: $($_.Exception.Response.StatusCode.value__) (esperado 401)"
}

""
"== chat COM token (esperado 200 com resposta da IA) =="
$body = '{"model":"deepseek-ai/DeepSeek-V4.1-Flash","messages":[{"role":"user","content":"Responda apenas: pronto"}],"max_tokens":20}'
try {
	$r = Invoke-WebRequest -Uri "$base/v1/chat/completions" -Method Post `
		-Headers @{ 'x-eb-token' = $Token } -ContentType 'application/json' `
		-Body $body -TimeoutSec 150 -UseBasicParsing
	"HTTP $($r.StatusCode)"
	$r.Content
} catch {
	"ERRO: $($_.Exception.Message)"
}

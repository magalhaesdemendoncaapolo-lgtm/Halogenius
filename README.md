# Halogenius

Biblioteca de vídeos com React/Vite, Fastify, PostgreSQL e ImageKit.
A interface e a API são publicadas juntas na Vercel, pela raiz do repositório.

Os vídeos e o player são públicos. Contas com permissão de editor podem enviar,
editar e excluir vídeos; administradores também criam, ativam e desativam usuários.

## Fluxo de upload

1. O navegador pede autorização em `POST /api/uploads/authorize`.
2. Envia o arquivo diretamente ao ImageKit usando uma assinatura temporária.
3. Envia somente os dados, o identificador do arquivo e o comprovante para `POST /api/videos`.
4. A API confere o arquivo no ImageKit e salva sua URL no PostgreSQL.

Limite da aplicação: 100 MB por vídeo. O arquivo não passa pelas Functions da Vercel,
que limitam o payload a 4,5 MB. A chave privada fica somente na API.
O banco continua no provedor atual. O Render não participa dessa estrutura.

## Desenvolvimento no PowerShell

Use Node.js 24. Na raiz:

```powershell
cd 'C:\Users\ALBERTO MENDONÇA\OneDrive\Documentos\Halogenius'
npm.cmd ci
npm.cmd ci --prefix REACT
```

Configure o `.env` da raiz, preservando a conexão existente:

```env
DATABASE_URL=postgresql://usuario:senha@host/database?sslmode=require
IMAGEKIT_PRIVATE_KEY=sua_chave_privada
IMAGEKIT_PUBLIC_KEY=sua_chave_publica
```

As duas chaves precisam pertencer à mesma conta ImageKit. Não coloque chaves privadas
no React nem use prefixo `VITE_`. Não envie o `.env` ao Git.
A API obtém a URL de entrega do próprio ImageKit.

Prepare o banco e inicie a API:

```powershell
npm.cmd run db:setup
npm.cmd run dev
```

## Primeiro administrador

Depois de preparar o banco, crie ou atualize sua conta administrativa. A senha não
aparece enquanto é digitada e não é armazenada em arquivos:

```powershell
cd 'C:\Users\ALBERTO MENDONÇA\OneDrive\Documentos\Halogenius'
npm.cmd run admin:create -- --email "seu-email@exemplo.com" --name "Seu nome"
```

Use uma senha exclusiva com pelo menos 10 caracteres. Depois de entrar no site,
abra **Usuários** para criar editores, alterar permissões, desativar acessos ou
trocar senhas. Não existe cadastro público de usuários.

As sessões duram oito horas e usam cookie `HttpOnly`, `Secure` e `SameSite=Strict`
em produção. Cinco senhas incorretas bloqueiam temporariamente a conta por 15 minutos.

API: `http://127.0.0.1:3333/api/health`. Em outro terminal:

```powershell
cd 'C:\Users\ALBERTO MENDONÇA\OneDrive\Documentos\Halogenius\REACT'
npm.cmd run dev
```

Abra a URL do Vite, normalmente `http://localhost:5173`.
O Vite encaminha `/api` para a API local. Reinicie a API se a versão anterior ainda
estiver usando a porta 3333. O arquivo `routes.http` serve para testar a API, não é a interface.

## Publicação na Vercel

No projeto existente:

1. Em Settings → Build and Deployment, deixe **Root Directory vazio (raiz)**.
   Não use mais `REACT`, pois isso excluiria a API do deploy.
2. Use o preset **Other**. O `vercel.json` define o build do Vite e a Function:
   - Install Command: `npm ci && npm ci --prefix REACT`
   - Build Command: `npm run build`
   - Output Directory: `REACT/dist`
3. Em Environment Variables, configure `DATABASE_URL`, `IMAGEKIT_PRIVATE_KEY`
   e `IMAGEKIT_PUBLIC_KEY` para Production e, se necessário, Preview.
4. Remova a antiga `VITE_API_URL` do Render. A interface usa sempre `/api`.
5. Execute `npm.cmd run db:setup` contra o banco de destino antes do deploy.
6. Publique esta versão do repositório e faça o deploy pela raiz.

Não é necessário configurar CORS entre a interface e a API: usam o mesmo domínio.
`api/index.js` recebe as requisições da Vercel; `local-server.js` inicia a API local.
`/api/*` é encaminhado à Function antes das páginas React.
`/videos/<id>` abre o player; `/api/videos` retorna JSON.

Valide `/api/health`, `/api/videos`, upload, reprodução e exclusão após publicar.
Só desative o serviço antigo do Render depois de validar o novo deploy.

As rotas de leitura de vídeos permanecem públicas. As rotas de upload, criação,
edição e exclusão exigem uma sessão de editor ou administrador. A gestão de usuários
é exclusiva de administradores e essas regras são verificadas pela API.

## Arquivos antigos e novas tentativas

Os registros antigos são preservados. URLs do Cloudinary podem estar indisponíveis.
Arquivos da pasta `uploads/` não são publicados nem servidos pela Vercel: precisam
ser reenviados ao ImageKit. A exclusão de registros legados não apaga arquivos antigos
no Cloudinary ou no disco.

Se o upload terminar, mas o cadastro falhar, clique novamente em Adicionar vídeo
sem trocar o arquivo ou recarregar a página. O upload é reutilizado e o banco evita
duplicação pelo identificador. O comprovante dura 24 horas. Arquivos enviados e
abandonados antes do cadastro podem ficar no ImageKit e ser removidos pelo painel.

## Verificações

Na raiz:

```powershell
npm.cmd test
.\node_modules\.bin\biome.cmd check .
npm.cmd run build
```

Os testes simulam rotas, assinaturas, erros e o envio direto de arquivos maiores que
4,5 MB. O upload real precisa ser validado com chaves válidas após o deploy.

Referências:
- [Vercel: limite de payload](https://vercel.com/docs/errors/function_payload_too_large)
- [Vercel: Functions Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [ImageKit: SDK Node.js](https://github.com/imagekit-developer/imagekit-nodejs)
- [OWASP: gerenciamento de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

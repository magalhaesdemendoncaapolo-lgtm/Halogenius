# Halogenius

Biblioteca de vídeos com operações de criar, listar, pesquisar, editar e excluir vídeos.

## Tecnologias

- API: Node.js, Fastify e PostgreSQL
- Interface: React e Vite
- Qualidade de código: Biome

## Requisitos

- Node.js instalado
- Uma base PostgreSQL acessível

## Configuração

Crie um arquivo `.env` na raiz do projeto e informe a conexão do banco:

```env
DATABASE_URL=sua_url_de_conexao_postgresql
```

Não envie esse arquivo ao Git: ele pode conter credenciais.

## Como iniciar o projeto

Instale as dependências da API:

```powershell
cd 'C:\Users\ALBERTO MENDONÇA\OneDrive\Documentos\Halogenius'
npm.cmd install
```

No primeiro terminal, inicie a API:

```powershell
cd 'C:\Users\ALBERTO MENDONÇA\OneDrive\Documentos\Halogenius'
npm.cmd run dev
```

A API estará disponível em `http://127.0.0.1:3333`.

Em um segundo terminal, instale e inicie a interface:

```powershell
cd 'C:\Users\ALBERTO MENDONÇA\OneDrive\Documentos\Halogenius\REACT'
npm.cmd install
npm.cmd run dev
```

Abra a URL exibida pelo Vite, normalmente `http://localhost:5173`.

## Endpoints da API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/videos` | Lista vídeos; aceita `?search=texto` |
| POST | `/videos` | Cria um vídeo |
| PUT | `/videos/:id` | Atualiza um vídeo |
| DELETE | `/videos/:id` | Exclui um vídeo |

## Verificações

Para verificar o código com o Biome:

```powershell
.\node_modules\.bin\biome.cmd check .
```

Para gerar o build de produção da interface:

```powershell
cd REACT
npm.cmd run build
```

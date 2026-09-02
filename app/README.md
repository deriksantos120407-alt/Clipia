# ClipIA funcional

Esta versão processa vídeos no navegador com FFmpeg.wasm.

## O que já funciona
- upload de MP4/WebM/MOV;
- 1, 3 ou 5 cortes;
- 15, 20, 30 ou 45 segundos;
- conversão automática para 9:16;
- preview;
- download em MP4.

## Publicar na Vercel
Envie estes arquivos para a raiz do repositório GitHub:
- `app/`
- `package.json`
- `tsconfig.json`
- `next-env.d.ts`

Depois faça um novo deploy na Vercel.

## Observação
O primeiro processamento baixa o motor FFmpeg para o navegador, então pode demorar.
Vídeos grandes exigem bastante memória. Para uso comercial em escala, o próximo passo é
mover o processamento para workers/servidores e adicionar IA real para selecionar os melhores momentos.

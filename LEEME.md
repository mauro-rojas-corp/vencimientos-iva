# Vencimientos IVA

App para cargar la liquidación de IVA de cada cliente, calcular su vencimiento según el
Calendario Perpetuo de la DNIT y generar la ficha para enviarle.

## Estructura
- `public/index.html` – la aplicación
- `netlify/functions/data.mjs` – guarda y lee los datos (Netlify Blobs)
- `netlify.toml` – configuración de Netlify

## Publicar
1. Subí esta carpeta a un repositorio de GitHub.
2. En Netlify: Add new site → Import an existing project → elegí el repositorio.
   No hace falta cambiar nada en la configuración de build (la toma de netlify.toml).
3. En Site configuration → Environment variables, creá `CLAVE_ACCESO` con la clave de la oficina.
4. Volvé a desplegar (Deploys → Trigger deploy) para que tome la clave.

Los datos quedan en Netlify Blobs, dentro del mismo sitio. No necesitás otra cuenta.

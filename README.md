# Bimo

## Requisitos

- [Node.js](https://nodejs.org/) 22 (también funciona con Node 20 LTS)
- [pnpm](https://pnpm.io/) 10 (`npm i -g pnpm@10`)
- Opcional: [Expo Go](https://expo.dev/go) en el celular, para probar la app sin compilar

## Instalación

```bash
git clone https://github.com/andreMD287/Bimo.git
cd Bimo
pnpm install   # desde la raíz: instala todos los paquetes del monorepo
```

## Cómo correrlo

Desde `frontend/`:

**En el navegador (web):**

```bash
npx expo start --web
```

**En el celular (Expo Go):**

```bash
npx expo start
```

Escanea el código QR con la cámara del iPhone (o con Expo Go en Android). El celular y el computador deben estar en la misma red Wi-Fi.

**Enlace publicado:** https://bimo-frontend.vercel.app

## Árbol de estructura

```
Bimo/
├── docs/
│   ├── semana1/                 entregables de la semana 1
│   ├── semana2/                 Product Blueprint y entregables
│   ├── semana3/
│   │   └── Documentacion.md     documentación del entregable 3
│   ├── arquitectura/            arquitectura del producto
│   └── specs/                   diseño detallado (fuente de verdad)
├── frontend/                    app Expo (dueño + verificador)
└── README.md
```

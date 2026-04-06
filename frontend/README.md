# Nuxt 3 

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# bun
bun run dev
```

## Production

Build the application for production:

```bash
# bun
bun run generate
```

Locally preview production build:

```bash
# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## CDN

**Place assets in `cdn/static` located in the root of the repository.**

Then, run command in the /cdn directory

```bash
# bun
bun gen
```

### Local development

Create symlink to cdn static in frontend folder

```bash
# macos
ln -s ../../cdn/static public/static

# windows
# use cmd in /frontend
mklink /D public\static ..\..\cdn\static
# or
# Power shell:
Start-Process -FilePath "$env:comspec" -ArgumentList "/k", "mklink", "/D", "`"public\static`"","`"..\..\cdn\static`""
```

### Usage

Use composable `$cdn.url()` anywhere you need

```vue
<template lang="pug">
  UIImage(
    :compressed="$cdn.url('avatar/01.webp')"
    :image="$cdn.url('avatar/01.jpg')"
  )
</template>
```

## Localization
[Google doc - UI_content_for_localization](https://docs.google.com/spreadsheets/d/12NbcM5ZB4kmlrSYDdKzJM0RdFT1Q5G8oexWkQscsJes/edit?gid=329043228#gid=329043228)

To generate localization files, you need to run the script `bun run get-l18n` (from the repository root)

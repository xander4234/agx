# AGX Salud — Base Angular con login premium

Esta propuesta convierte tu `index` original a una estructura Angular separando:
- pantalla de login
- dashboard inicial
- servicio de autenticación
- rutas

## Estructura
```bash
src/
  app/
    app.component.ts
    app.config.ts
    app.routes.ts
    core/
      services/
        auth.service.ts
    features/
      auth/
        login/
          login.component.ts
          login.component.html
          login.component.css
      dashboard/
        dashboard.component.ts
        dashboard.component.html
        dashboard.component.css
  index.html
  main.ts
  styles.css
```

## Cómo usarlo
1. Crea un proyecto Angular standalone:
   ```bash
   ng new agx-salud --standalone --style css
   ```
2. Reemplaza la carpeta `src` con los archivos de esta propuesta.
3. Ejecuta:
   ```bash
   npm install
   ng serve
   ```

## Qué incluye
- Imagen principal grande de una doctora al lado izquierdo.
- Caja de login al costado derecho.
- Selector visual de rol: **Paciente** o **Médico**.
- Diseño moderno, limpio, didáctico y responsivo.
- Navegación simple a un dashboard demo después del login.

## Nota sobre la imagen
La imagen está definida desde CSS con una URL externa para que puedas verla enseguida.
Si prefieres usar una foto local, reemplaza la propiedad `background-image` en:

`src/app/features/auth/login/login.component.css`

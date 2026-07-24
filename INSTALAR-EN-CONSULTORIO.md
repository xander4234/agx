# AGX Salud — Instalación en la computadora del consultorio

El sistema completo (base de datos + servidor + web) corre en la propia computadora del médico.
No necesita internet para funcionar, y **los datos de los pacientes nunca salen de esa computadora**.

## Requisito único: Docker Desktop

1. Descarga **Docker Desktop** desde https://www.docker.com/products/docker-desktop/
   (versión para Windows o Mac, según la computadora).
2. Instálalo y ábrelo una vez (deja que termine de iniciar; el ícono de la ballena queda fijo).

Con eso basta. No hace falta instalar Node, PostgreSQL ni nada más.

## Instalar el sistema (una sola vez)

1. Copia la carpeta del proyecto a la computadora del médico (por USB o descargándola).
2. Abre la carpeta.
3. **Windows**: doble clic en `iniciar.bat`.
   **Mac/Linux**: abre una terminal en la carpeta y ejecuta `docker compose up -d`.

La primera vez tarda unos minutos (descarga y arma todo). Cuando termine, abre el navegador en:

**http://localhost:8080**

Entra con el usuario que le hayas creado (por ejemplo `angel@agx.local` / `Xander123`).

## Uso diario

- **Encender el sistema**: doble clic en `iniciar.bat` (o `docker compose up -d`).
  También puedes dejar Docker Desktop configurado para que arranque solo con la computadora,
  y el sistema queda siempre disponible en `http://localhost:8080`.
- **Apagar**: doble clic en `detener.bat` (o `docker compose down`).
- Los datos y los exámenes se guardan solos y se conservan aunque apagues la computadora.

## Copia de seguridad (respaldo)

**El sistema hace un respaldo automático cada 24 horas** en la carpeta `respaldos/`
(dentro de la carpeta del proyecto), y conserva los últimos 14. El médico solo debe
copiar esa carpeta a un USB o disco externo de vez en cuando.

Para restaurar un respaldo en una computadora nueva (con el sistema ya instalado):

```
gzip -d respaldo-2026-07-24_0300.sql.gz
docker exec -i agx_db psql -U agx agx_health < respaldo-2026-07-24_0300.sql
```

En Windows puedes descomprimir el `.gz` con 7-Zip y luego ejecutar el segundo comando.

También puedes hacer un respaldo manual en cualquier momento:

```
docker exec agx_db pg_dump -U agx agx_health > respaldo.sql
```

## Cambiar la contraseña de la base (recomendado antes de entregar)

Edita `docker-compose.yml` y cambia `agxpass` (aparece 2 veces) y `JWT_SECRET`
por valores propios, antes de la primera instalación.

## Notas

- El sistema funciona en esa computadora y en las que estén en la **misma red local**:
  desde otra máquina del consultorio, entra a `http://IP_DE_LA_PC:8080`
  (la IP la ves con `ipconfig` en Windows).
- Si el médico quiere acceder desde fuera del consultorio (su casa, el celular con datos),
  eso ya requiere exponerlo a internet — se puede con Cloudflare Tunnel, pero es otro paso.

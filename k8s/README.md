# Desplegar AGX Salud en Kubernetes

Guía para poner el sistema en tu servidor Ubuntu con Kubernetes, listo para producción:
base de datos permanente, exámenes que no se borran, HTTPS y backups automáticos.

## Antes de empezar

Necesitas en el cluster:

- **ingress-nginx** (para exponer el sitio):
  ```bash
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/baremetal/deploy.yaml
  ```
- **cert-manager** (para el certificado HTTPS gratis):
  ```bash
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
  ```

## Paso 1 — Cambiar las contraseñas (IMPORTANTE)

Antes de aplicar, edita estos dos archivos y pon claves fuertes:

- `postgres/secret.yaml` → `POSTGRES_PASSWORD`
- `server/secret.yaml` → `JWT_SECRET` (una cadena larga aleatoria) y `PGPASSWORD` (la MISMA de arriba).
  Opcional: `OPENAI_API_KEY` si quieres el triage con IA.

> Genera un secreto fuerte con: `openssl rand -hex 32`

## Paso 2 — Aplicar todo, en orden

```bash
cd k8s

# 1) Base de datos (con almacenamiento permanente)
kubectl apply -f postgres/secret.yaml
kubectl apply -f postgres/pvc.yaml
kubectl apply -f postgres/deployment.yaml
kubectl apply -f postgres/service.yaml

# 2) Backend (crea tablas solo con el initContainer, guarda exámenes en disco)
kubectl apply -f server/secret.yaml
kubectl apply -f server/configmap.yaml
kubectl apply -f server/uploads-pvc.yaml
kubectl apply -f server/deployment.yaml
kubectl apply -f server/service.yaml

# 3) Frontend
kubectl apply -f web/deployment.yaml
kubectl apply -f web/service.yaml

# 4) HTTPS + dominio
kubectl apply -f cluster-issuer.yaml
kubectl apply -f ingress.yaml

# 5) Backups automáticos diarios
kubectl apply -f backup/pvc.yaml
kubectl apply -f backup/cronjob.yaml
```

## Paso 3 — Apuntar el dominio

En Cloudflare, crea un registro **A** apuntando `salud.angelxander.com` a la **IP pública de tu servidor**
(proxy en gris / "solo DNS" para que cert-manager emita el certificado).
Abre los puertos 80 y 443 hacia el ingress-nginx del cluster.

> Alternativa recomendada (no expones tu IP): **Cloudflare Tunnel**. Instala `cloudflared` en el
> servidor, crea un túnel a `frontend-service:80` y en Cloudflare apunta `salud.angelxander.com` al túnel.
> Con esto NO necesitas abrir puertos ni el Ingress público; el HTTPS lo pone Cloudflare.

## Paso 4 — Verificar

```bash
kubectl get pods                # todos Running
kubectl logs deploy/server      # "AGX Health server corriendo..."
kubectl get certificate         # agx-tls → READY True (puede tardar minutos)
```

Entra a **https://salud.angelxander.com** con `angel@agx.local` / `Xander123`.

## Operación diaria

**Actualizar a una nueva versión** (cuando cambies el código):
El CI construye las imágenes y actualiza los `deployment.yaml`. Luego:
```bash
kubectl apply -f server/deployment.yaml -f web/deployment.yaml
```
El initContainer aplica automáticamente cualquier cambio de esquema de la base de datos.

**Ver / restaurar un backup**:
```bash
# listar backups
kubectl exec deploy/postgres -- ls -lh /backups   # (si montas el PVC ahí) o revisa backup-pvc
# restaurar uno
gunzip -c agx_2026-07-18_0300.sql.gz | kubectl exec -i deploy/postgres -- psql -U agx -d agx_health
```

**Escalar** (más tráfico): sube `replicas` en `server/deployment.yaml` y `web/deployment.yaml`.
Nota: si escalas el server a 2+ réplicas, el volumen de exámenes (`ReadWriteOnce`) debe cambiarse por
almacenamiento compartido (NFS / `ReadWriteMany`) o mover los archivos a un bucket S3/R2.

## Qué resuelve este setup

| Necesidad | Cómo |
|---|---|
| Base de datos permanente | `postgres-pvc` (disco persistente) |
| Exámenes que no se borran | `uploads-pvc` montado en `/app/uploads` |
| HTTPS automático | ingress + cert-manager (Let's Encrypt) |
| Backups diarios | CronJob `postgres-backup`, conserva 14 días |
| Recuperación ante caídas | livenessProbe reinicia el pod si falla |
| Tablas creadas solas | initContainer `db-init` en cada despliegue |

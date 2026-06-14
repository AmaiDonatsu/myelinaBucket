# myelinaBucket

Daemon local para simular buckets por proyecto y preparar integraciones multimedia antes de pasar a un proveedor real en produccion.

## Lo que hace

- Corre como servicio en segundo plano y sobrevive al cierre de la terminal.
- Permite apagarlo desde otra terminal.
- Crea proyectos con credenciales propias para simular un bucket por aplicacion.
- Guarda archivos en disco organizados por proyecto y ruta.
- Expone una API HTTP local para subir, leer y borrar imagenes, videos, audio y otros archivos.

## Comandos

Desde PowerShell (Windows):

```powershell
.\bin\myelina-bucket.ps1 start
.\bin\myelina-bucket.ps1 status
.\bin\myelina-bucket.ps1 create-project mi-app
.\bin\myelina-bucket.ps1 list-projects
.\bin\myelina-bucket.ps1 stop
```

Desde Bash (Linux / macOS):

```bash
./bin/myelina-bucket start
./bin/myelina-bucket status
./bin/myelina-bucket create-project mi-app
./bin/myelina-bucket list-projects
./bin/myelina-bucket stop
```

## Usarlo desde cualquier terminal

### En Windows (PowerShell)

Puedes dejar fija la ruta del proyecto con variables de entorno de usuario:

```powershell
[Environment]::SetEnvironmentVariable(
  "MYELINA_BUCKET_HOME",
  "C:\Users\rodol\development\utils\myelinaBucket",
  "User"
)

[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Users\rodol\development\utils\myelinaBucket\bin",
  "User"
)
```

### En Linux / macOS (Bash)

Puedes agregar el directorio al `PATH` y definir `MYELINA_BUCKET_HOME` en tu archivo de configuración (ej. `~/.bashrc` o `~/.zshrc`):

```bash
export MYELINA_BUCKET_HOME="/ruta/a/tu/myelinaBucket"
export PATH="$PATH:$MYELINA_BUCKET_HOME/bin"
```

### Usando pnpm (Multiplataforma)

Puedes enlazar el comando globalmente usando `pnpm`:

```bash
# Enlaza el comando myelina-bucket al gestor de paquetes global
pnpm link --global

# Después podrás ejecutar el comando directamente desde cualquier terminal
myelina-bucket start
myelina-bucket status
myelina-bucket create-project mi-app
myelina-bucket stop
```

## Estructura de datos

Los archivos se almacenan asi:

```text
data/
  projects/
    mi-app/
      project.json
      objects/
        media/
          avatar.png
```

## Credenciales que devuelve

Al crear un proyecto se imprime algo asi:

```json
{
  "project": "mi-app",
  "projectId": "mi-app",
  "bucketName": "mi-app-bucket",
  "endpoint": "http://127.0.0.1:4040",
  "accessKey": "mb_xxx",
  "secretKey": "ms_xxx"
}
```

Con eso puedes configurar tu aplicacion para apuntar al endpoint local y autenticar sus cargas.

## API local

### Subir un archivo

En PowerShell:
```powershell
$headers = @{
  "x-access-key" = "TU_ACCESS_KEY"
  "x-secret-key" = "TU_SECRET_KEY"
}

Invoke-WebRequest `
  -Method Put `
  -Uri "http://127.0.0.1:4040/b/mi-app-bucket/media/avatar.png" `
  -Headers $headers `
  -InFile "C:\ruta\avatar.png" `
  -ContentType "application/octet-stream"
```

En Bash (Linux/macOS con curl):
```bash
curl -X PUT \
  -H "x-access-key: TU_ACCESS_KEY" \
  -H "x-secret-key: TU_SECRET_KEY" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/ruta/al/archivo.png" \
  "http://127.0.0.1:4040/b/mi-app-bucket/media/avatar.png"
```

### Descargar un archivo

En PowerShell:
```powershell
$headers = @{
  "x-access-key" = "TU_ACCESS_KEY"
  "x-secret-key" = "TU_SECRET_KEY"
}

Invoke-WebRequest `
  -Method Get `
  -Uri "http://127.0.0.1:4040/b/mi-app-bucket/media/avatar.png" `
  -Headers $headers `
  -OutFile "C:\tmp\avatar.png"
```

En Bash (Linux/macOS con curl):
```bash
curl -H "x-access-key: TU_ACCESS_KEY" \
  -H "x-secret-key: TU_SECRET_KEY" \
  -o "/ruta/al/destino.png" \
  "http://127.0.0.1:4040/b/mi-app-bucket/media/avatar.png"
```

### Borrar un archivo

En PowerShell:
```powershell
$headers = @{
  "x-access-key" = "TU_ACCESS_KEY"
  "x-secret-key" = "TU_SECRET_KEY"
}

Invoke-RestMethod `
  -Method Delete `
  -Uri "http://127.0.0.1:4040/b/mi-app-bucket/media/avatar.png" `
  -Headers $headers
```

En Bash (Linux/macOS con curl):
```bash
curl -X DELETE \
  -H "x-access-key: TU_ACCESS_KEY" \
  -H "x-secret-key: TU_SECRET_KEY" \
  "http://127.0.0.1:4040/b/mi-app-bucket/media/avatar.png"
```

### Listar objetos

En PowerShell:
```powershell
$headers = @{
  "x-access-key" = "TU_ACCESS_KEY"
  "x-secret-key" = "TU_SECRET_KEY"
}

Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:4040/b/mi-app-bucket?prefix=media/" `
  -Headers $headers
```

En Bash (Linux/macOS con curl):
```bash
curl -H "x-access-key: TU_ACCESS_KEY" \
  -H "x-secret-key: TU_SECRET_KEY" \
  "http://127.0.0.1:4040/b/mi-app-bucket?prefix=media/"
```

## Notas

- El daemon usa `127.0.0.1:4040` por defecto.
- El PID y estado viven en `runtime/`.
- Los logs viven en `logs/daemon.log`.
- Los proyectos registrados viven en `data/system/projects.json`.

# entre nosotras

Álbum privado y adaptable a celulares para compartir fotos, videos, stickers y música entre dos cuentas. Está hecho con React, TypeScript y Supabase; los archivos se guardan en un bucket privado y se muestran mediante enlaces temporales firmados.

## Ponerlo en marcha

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. En el **SQL Editor** de Supabase, ejecuta el contenido actualizado de [`supabase/schema.sql`](./supabase/schema.sql). Si ya habías instalado la versión anterior, vuelve a ejecutar el archivo: añade el perfil, los tipos de recuerdo y las políticas necesarias conservando el álbum y sus fotos.
3. En **Project Settings → API**, copia la Project URL y la clave `anon`/publishable. No uses la clave `service_role` en el navegador.
4. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. Ejecuta:

   ```sh
   npm.cmd install
   npm.cmd run dev
   ```

6. Crea tu cuenta. Desde la otra cuenta, crea el álbum y comparte el código de ocho caracteres; la primera cuenta puede unirse con ese código.

Si Supabase tiene activada la confirmación por correo, confirma la cuenta desde el enlace recibido antes de iniciar sesión. Para probar sin ese paso, se puede desactivar temporalmente **Authentication → Providers → Email → Confirm email** en el proyecto.

## Qué incluye

- Registro e inicio de sesión con correo y contraseña.
- Álbum único por cuenta y máximo de dos integrantes por álbum.
- Código de invitación de ocho caracteres, que puede compartirse con la segunda integrante.
- Recuerdos privados: fotos (10 MB), videos (50 MB), archivos de música/audio (20 MB) y stickers integrados.
- Filtros para fotos, videos, stickers y música, con nota opcional y reacciones de corazón.
- Perfil con nombre, foto y fondo personalizables; la foto y el fondo también se comparten solo dentro del álbum.
- Diseño adaptable para pantallas de celular, tablet y escritorio.
- Restricciones de acceso en Postgres y Storage para que solo las integrantes del álbum puedan consultar sus fotos.
- Formatos de imagen: JPG, PNG, GIF y WEBP; video: MP4, WebM y MOV; audio: MP3, M4A, AAC, WAV, OGG y WebM.

Las variables `VITE_*` se incluyen en el bundle del navegador; por eso solo debe usarse la clave pública `anon`/publishable. La seguridad de los datos se aplica mediante RLS y políticas del bucket, no mediante secretos en el frontend.

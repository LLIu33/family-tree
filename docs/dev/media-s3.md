# Media и S3

Файлы людей (в т.ч. аватары) хранятся во **внешнем S3-совместимом бакете**. Узел `Media` в Neo4j держит `treeId`, URL и метаданные; бинарник в граф не пишется.

Связь: `(Individual)-[:HAS_MEDIA]->(Media)`.

## Эндпоинты

Префикс контроллера: **`family-tree/media`**.

| Метод | Путь | MinRole |
|-------|------|---------|
| `POST` | `/family-tree/media/upload` | editor |
| `GET` | `/family-tree/media/:individualId` | viewer |
| `DELETE` | `/family-tree/media/:mediaId` | editor |

Ещё загрузка: `POST /family-tree/individuals/:id/media` (тоже editor, multipart `file`).

`POST .../upload` ждёт `CreateMediaDto`: обязателен `attachedToId` (id индивида), `type` (`PHOTO` \| `DOCUMENT` \| `AUDIO` \| `VIDEO`). Для `PHOTO` делается thumbnail WebP 300×300.

Без S3 загрузка падает: `S3 storage is not configured (STORAGE_TYPE is not s3)`.

## Env

Нужно `STORAGE_TYPE=s3` и ключи AWS (или совместимого API). Эталон — корневой `.env.example`.

| Переменная | Зачем |
|------------|--------|
| `STORAGE_TYPE` | только `s3` реально работает |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | доступ |
| `AWS_REGION` | регион (для Yandex часто `ru-central1`) |
| `AWS_S3_BUCKET` | бакет |
| `AWS_S3_ENDPOINT` | API endpoint с `https://` (Yandex, MinIO, R2) |
| `AWS_S3_PUBLIC_URL_BASE` | публичный префикс URL в БД, без `/` в конце |
| `AWS_S3_FORCE_PATH_STYLE` | иначе `true`, если задан endpoint |

CRUD людей и GEDCOM **без** object storage работают. Аватары и прочий upload — нет.

## Local storage

`STORAGE_TYPE=local` в конфиге есть (`STORAGE_LOCAL_PATH`), но `StorageService` **не реализует** диск: любой upload вызывает `requireS3()` и бросает ошибку, если тип не `s3`.

Загрузка в бакет идёт с `ACL: public-read`. Публичный URL собирается из `AWS_S3_PUBLIC_URL_BASE` или `https://<bucket>.s3.amazonaws.com`.

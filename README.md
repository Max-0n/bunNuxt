# Triple studio

### [Telegram bot](https://t.me/triplestudiobot)


## Поднимаем бэк локально

- Создаём копию .env файла `cp ./backend/.env ./`
- Cоздаём docker сеть `docker network create backend_pg_net`
- Поднимаем Postgres и Backend `docker compose up -d backend postgres`

### Отключаем сборку

- `docker compose down backend postgres`
- Удаляем сеть `docker network rm backend_pg_net`
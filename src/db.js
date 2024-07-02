const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./bot.db");

// Создание таблицы для хранения фотографий, если она не существует
db.serialize(() => {
  db.run(
    `
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            request_number NUMBER,
            file_id TEXT,
            media TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      console.log('Table "photos" is ready.');
    }
  );

  db.run(
    `
      CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          user_id NUMBER,
          role TEXT,
          requests TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      console.log('Table "users" is ready.');
    }
  );

  // CLIENTS
  db.run(
    `
      CREATE TABLE IF NOT EXISTS models (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
  `,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      console.log('Table "models" is ready.');
    }
  );
});

module.exports = { db };

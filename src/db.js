const sqlite3 = require("sqlite3").verbose();
const { sqlPhotos, sqlUsers } = require("./sql");

const dbName = "db.sqlite";
const db = new sqlite3.Database(dbName);

db.serialize(() => {
  db.run(sqlUsers, (err) => {
    if (err) {
      return console.error(err.message);
    }

    console.log('Table "users" is ready.');
  });

  db.run(sqlPhotos, (err) => {
    if (err) {
      return console.error(err.message);
    }

    console.log('Table "photos" is ready.');
  });
});

module.exports = { db };

const { db } = require("./db");

module.exports = {
  registerModels: (modelNames, callback) => {
    const placeholders = modelNames.map(() => "(?)").join(",");
    db.run(
      `INSERT OR IGNORE INTO models (name) VALUES ${placeholders}`,
      modelNames,
      function (err) {
        if (err) {
          return console.error(err.message);
        }
        console.log(`Models ${modelNames.join(", ")} have been registered.`);
        callback();
      }
    );
  },

  createNewRequest: (params, callback) => {
    const { creator_id, request } = params;

    db.get(
      "SELECT requests FROM users WHERE user_id = ?",
      [creator_id],
      (error, row) => {
        if (error) {
          return console.log(error);
        }

        let requests = [];

        if (row && row.requests) {
          // Преобразуем JSON-строку в массив
          requests = JSON.parse(row.requests);
        }

        // Добавляем новый запрос в массив
        requests.push(request);

        // Преобразуем массив обратно в JSON-строку
        const requestsJson = JSON.stringify(requests);

        // Обновляем поле requests у пользователя
        db.run(
          "UPDATE users SET requests = ? WHERE user_id = ?",
          [requestsJson, creator_id],
          function (err) {
            if (err) {
              return callback(err);
            }
            callback(null);
          }
        );
      }
    );
  },

  registerUser: (user, role, callback) => {
    db.run(
      "INSERT OR IGNORE INTO users (username, user_id, role) VALUES (?, ?, ?)",
      [user.username, user.id, role],
      function (err) {
        if (err) {
          return console.error(err.message);
        }
        console.log(
          `User ${user.username} with role ${role} has been registered.`
        );
        callback();
      }
    );
  },

  // Функция для получения роли пользователя
  getUserRole: (username, callback) => {
    db.get(
      "SELECT role FROM users WHERE username = ?",
      [username],
      (err, row) => {
        if (err) {
          return console.error(row, err.message);
        }
        callback(row ? row.role : null);
      }
    );
  },

  getCreators: (callback) => {
    db.all("SELECT * FROM users WHERE role = ?", ["model"], (err, rows) => {
      if (err) {
        throw err;
      }
      callback(rows);
    });
  },

  // Function to store photos in the database
  storePhoto: (username, request_number, media) => {
    db.get(
      "SELECT media FROM photos WHERE request_number = ?",
      [request_number],
      (error, row) => {
        if (error) {
          return console.log(error);
        }

        let updatedMedia = [];

        if (row?.media) {
          updatedMedia = JSON.parse(row.media);
        }

        updatedMedia = [...updatedMedia, ...JSON.parse(media)];

        const mediaJson = JSON.stringify(updatedMedia);

        if (row) {
          db.run(
            "UPDATE photos SET media = ? WHERE request_number = ?",
            [mediaJson, request_number],
            function (err) {
              if (err) {
                return console.error(err.message);
              }
              console.log(`Row(s) updated: ${this.changes}`);
            }
          );
        } else {
          // Вставляем новую запись
          db.run(
            "INSERT INTO photos (username, request_number, media) VALUES (?, ?, ?)",
            [username, request_number, mediaJson],
            function (err) {
              if (err) {
                return console.error(err.message);
              }
              console.log(`A row has been inserted with rowid ${this.lastID}`);
            }
          );
        }
      }
    );
  },

  // Функция для получения фотографий из базы данных
  getPhotos: (username, requestNumber, callback) => {
    db.all(
      "SELECT media FROM photos WHERE username = ? AND request_number = ?",
      [username, requestNumber],
      (err, rows) => {
        if (err) {
          return console.error(err.message);
        }
        console.log(rows);
        callback(JSON.parse(rows?.[0]?.media ?? "[]"));
      }
    );
  },
};

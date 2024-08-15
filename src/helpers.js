const { db } = require("./db");

module.exports = {
  createNewRequest: (params, callback) => {
    const { creator_id, request } = params;

    db.get(
      "SELECT requests FROM users WHERE username = ?",
      [creator_id],
      (error, row) => {
        if (error) {
          return console.log(error);
        }

        let requests = [];

        if (row && row.requests) {
          requests = JSON.parse(row.requests);
        }

        requests.push(request);
        const requestsJson = JSON.stringify(requests);

        db.run(
          "UPDATE users SET requests = ? WHERE username = ?",
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


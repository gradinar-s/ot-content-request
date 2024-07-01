require("dotenv").config();
require("./db");
const { Telegraf, Markup } = require("telegraf");
const LocalSession = require("telegraf-session-local");
const helpers = require("./helpers");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(new LocalSession({ database: "session.json" }).middleware());

bot.command("check", (ctx) => {
  // Только для Managers
  const [command, username, requestNumber] = ctx.message.text.split(" ");

  if (!username || !requestNumber) {
    return ctx.reply(
      "Please provide the request number. Use /check <username> <number>"
    );
  }

  helpers.getPhotos(username, requestNumber, (photos) => {
    console.log(photos);
    if (photos.length > 0) {
      ctx.replyWithMediaGroup(
        photos.map((photo) => ({ type: "photo", media: photo.file_id }))
      );
    } else {
      ctx.reply("Фотографии для данного пользователя не найдены.");
    }
  });
});

bot.command("open", (ctx) => {
  const [command, requestNumber] = ctx.message.text.split(" ");

  // Только для Creators
  if (!requestNumber) {
    return ctx.reply("Use /open <request number>");
  }

  helpers.getCreators((creators) => {
    const creator = creators.find((c) => c.username === ctx.chat.username);
    const requests = JSON.parse(creator.requests);
    const request = requests?.find((r) => r.id === Number(requestNumber));

    if (request) {
      const request_html = `
<strong>Request №${request.id}</strong> for <u>${request.models_article}</u> from @${request.requester}
      
<strong>Description:</strong> ${request.description}
      `;

      ctx.reply(request_html, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Upload Content",
                callback_data: `${request.id}_upload_content`,
              },
            ],
          ],
        },
      });
    } else {
      ctx.reply("Запрос не найден");
    }
  });
});

bot.on("photo", (ctx) => {
  if (ctx.session.current_step === "CREATOR/UPLOAD_CONTENT") {
    const username = ctx.from.username;
    const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id; // getting the highest resolution photo

    ctx.session.current_step = "CREATOR/MAIN_MENU";
    const request_number = ctx.session.userData.request_number;
    console.log(request_number);

    // Привязываем фотку к запросу
    helpers.storePhoto(username, request_number, photo);
    // Отмечаем задание как выполненное

    ctx.reply(
      "Photo received and saved!",
      Markup.keyboard(["📹 Requests"]).resize()
    );
  }
});

bot.start(async (ctx) => {
  ctx.session.userData = {
    tg_id: ctx.message.from.id,
    tg_username: ctx.message.from?.username,
  };

  const username = ctx.from.username;

  helpers.getUserRole(username, (role) => {
    if (role) {
      if (role === "manager") {
        ctx.session.current_step = "MANAGER/MAIN_MENU";

        ctx.reply(
          `Welcome back, ${username}! Your role is ${role}.`,
          Markup.keyboard([["📹 Request content"]]).resize()
        );
      }

      if (role === "model") {
        ctx.session.current_step = "CREATOR/MAIN_MENU";

        ctx.reply(
          `Welcome back, ${username}! Your role is ${role}.`,
          Markup.keyboard([[`📹 Requests`]]).resize()
        );
      }
    } else {
      ctx.session.current_step = "ROLE_SELECTION";
      return ctx.reply(
        "Who are you?",
        Markup.keyboard([
          ["👱‍♀️ Creator (Will provide content)"],
          ["👨‍💻 Manager (Will request content)"],
          // Добавить кнопку перегеристрироваться (на случай если выбрал не то)
        ]).resize()
      );
    }
  });
});

bot.on("message", async (ctx) => {
  if (ctx.session.current_step === "ROLE_SELECTION") {
    const user = { username: ctx.from.username, id: ctx.from.id };

    if (ctx.message.text === "👱‍♀️ Creator (Will provide content)") {
      ctx.session.current_step = "CREATOR/MAIN_MENU";

      return helpers.registerUser(user, "model", () => {
        ctx.reply(
          "You have been registered as a Creator.",
          Markup.keyboard(["📹 Requests"]).resize()
        );
      });
    }

    if (ctx.message.text === "👨‍💻 Manager (Will request content)") {
      ctx.session.current_step = "MANAGER/MAIN_MENU";

      return helpers.registerUser(user, "manager", () => {
        ctx.reply(
          "You have been registered as a Manager.",
          Markup.keyboard([["📹 Request content"]]).resize()
        );
      });
    }
  }

  if (ctx.session.current_step === "MANAGER/MAIN_MENU") {
    if (ctx.message.text === "📹 Request content") {
      ctx.session.current_step = "REQUEST_CONTENT/CREATOR_USERNAME";

      return ctx.reply(
        "Enter the username of model's manager",
        Markup.removeKeyboard()
      );
    }
  }

  if (ctx.session.current_step === "CREATOR/MAIN_MENU") {
    if (ctx.message.text === "📹 Requests") {
      helpers.getCreators((creators) => {
        const creator_username = ctx.chat.username;
        const creator = creators.find((c) => c.username === creator_username);
        const requests = JSON.parse(creator.requests);

        const requests_count = requests?.length ?? 0;

        return ctx.reply(
          `You have ${requests_count} request(s)
          
${requests
  .map(
    (request) =>
      `<strong>№${request.id}</strong> / ${request.models_article} / @${request.requester}\n`
  )
  .join("")}

<i>Use <code>/open number</code> to see more details about a request</i>`,
          { parse_mode: "HTML" }
        );
      });
    }
  }

  if (ctx.session.current_step === "CREATOR/UPLOAD_CONTENT") {
    if (ctx.message.text === "Cancel") {
      ctx.session.current_step = "CREATOR/MAIN_MENU";
      ctx.reply("Canceled", Markup.keyboard(["📹 Requests"]).resize());
    }
  }

  if (ctx.session.current_step === "REQUEST_CONTENT/CREATOR_USERNAME") {
    helpers.getCreators((creators) => {
      const creator_username = ctx.message.text;
      const creator = creators.find((c) => c.username === creator_username);

      if (creator) {
        // Обрезать собачку
        // Проверить кейс креейтор зарегистрировался в боте, а потом изменил юзернейм
        ctx.session.userData = { ...ctx.session.userData, creator_username };
        ctx.session.current_step = "REQUEST_CONTENT/MODELS_ARTICLE";
        return ctx.reply("Which model or models is this request for?");
      } else {
        return ctx.reply(
          "No such creator was found. The name must match their username in Telegram"
        );
      }
    });
  }

  if (ctx.session.current_step === "REQUEST_CONTENT/MODELS_ARTICLE") {
    // Validation ... and if ok ->
    ctx.session.userData = {
      ...ctx.session.userData,
      models_article: ctx.message.text,
    };
    ctx.session.current_step = "REQUEST_CONTENT/DESCRIPTION";
    return ctx.reply("Describe your request");
  }

  if (ctx.session.current_step === "REQUEST_CONTENT/DESCRIPTION") {
    // Validation ... and if ok ->
    const request_description = ctx.message.text;

    ctx.session.userData = {
      ...ctx.session.userData,
      request_description,
    };

    // ctx.session.current_step = "REQUEST_CONTENT/DESCRIPTION";
    return ctx.replyWithMarkdownV2(
      `
*Is the task described correctly?*

Request for *${ctx.session.userData.models_article}*
*Description:* ${request_description}
`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Yes", "confirm_request"),
          Markup.button.callback("Reenter", "reenter_request"),
        ],
      ]).resize()
    );
  }
});

// Actions
bot.action("confirm_request", (ctx) => {
  ctx.answerCbQuery();

  helpers.getCreators((creators) => {
    ctx.session.current_step = "MANAGER/MAIN_MENU";

    const requester = ctx.session.userData.tg_username;
    const models_article = ctx.session.userData.models_article;
    const creator_username = ctx.session.userData.creator_username;
    const request_description = ctx.session.userData.request_description;

    const creator = creators.find((c) => c.username === creator_username);
    const requests = JSON.parse(creator.requests);

    const request = {
      id: (requests?.length ?? 0) + 1,
      models_article,
      requester,
      description: request_description,
    };

    helpers.createNewRequest(
      { creator_id: creator?.user_id, request },
      () => {}
    );

    const request_markdownV2 = `
<strong>Request №${request.id}</strong> for <u>${models_article}</u> from @${requester}

<strong>Description:</strong> ${request_description}
`;

    ctx.telegram
      .sendMessage(creator?.user_id, request_markdownV2, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Upload Content",
                callback_data: `${request.id}_upload_content`,
              },
            ],
          ],
        },
      })
      .then(() => {
        ctx.reply(
          "Your request has been sent",
          Markup.keyboard([["📹 Request content"]]).resize()
        );
      });
  });
});

bot.action("reenter_request", (ctx) => {
  ctx.answerCbQuery();
  // return ctx.reply("");
});

bot.action(/.+_upload_content/, (ctx) => {
  ctx.answerCbQuery();
  ctx.session.current_step = "CREATOR/UPLOAD_CONTENT";

  helpers.getCreators((creators) => {
    const requestId = ctx.match[0][0];
    const creator = creators.find((c) => c.username === ctx.chat.username);
    const requests = JSON.parse(creator.requests);
    const request = requests?.find((r) => r.id === Number(requestId));

    ctx.session.userData = {
      ...ctx.session.userData,
      request_number: request.id,
    };

    return ctx.reply(
      "Upload the content",
      Markup.keyboard([["Cancel"]]).resize()
    );
  });
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

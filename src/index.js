require("dotenv").config();
require("./db");

const { Telegraf, Markup } = require("telegraf");
const LocalSession = require("telegraf-session-local");
const helpers = require("./helpers");
const mediaGroup = require("./media_group");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(new LocalSession({ database: "session.json" }).middleware());
bot.use(mediaGroup());

// Присылать менеджеру сообщение что клиент выполнил задание вместо ручно проверки командой (команду пока оставить)
bot.command("check", (ctx) => {
  if (ctx.session.userData.role === "manager") {
    // меняем шаг на checking
    const [command, username, requestNumber] = ctx.message.text.split(" ");

    if (!username || !requestNumber) {
      return ctx.reply(
        "Please provide the request number. Use /check <username> <number>"
      );
    }

    helpers.getPhotos(username, requestNumber, async (media) => {
      if (media.length > 0) {
        await ctx.replyWithMediaGroup(
          media.map((m) => ({ type: m.type, media: m.file_id }))
        );
        // await ctx.reply("Confirm or reject the completed request", {
        //   reply_markup: {
        //     inline_keyboard: [
        //       [
        //         { text: "Approve", callback_data: "approve_content" },
        //         { text: "Ask to redo", callback_data: "ask_to_redo" },
        //       ],
        //     ],
        //   },
        // });
      } else {
        ctx.reply("Фотографии для данного пользователя не найдены.");
      }
    });
  } else {
    ctx.reply("The command is available only for Managers");
  }
});

bot.command("open", (ctx) => {
  if (ctx.session.userData.role === "model") {
    const [command, requestNumber] = ctx.message.text.split(" ");

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
  } else {
    ctx.reply("The command is available only for Creators");
  }
});

const uploadContent = (ctx) => {
  if (ctx.session.current_step === "CREATOR/UPLOAD_CONTENT") {
    const username = ctx.from.username;
    const media_group = ctx?.mediaGroup;
    const request_number = ctx.session.userData.request_number;

    if (media_group) {
      const media = media_group
        .filter((media) => media?.photo || media?.video || media?.document)
        .map((media) => {
          if (media?.photo) {
            return {
              type: "photo",
              file_id: media?.photo?.[media?.photo?.length - 1]?.file_id,
            };
          }

          if (media?.video) {
            return { type: "video", file_id: media?.video?.file_id };
          }

          if (media?.document) {
            return { type: "document", file_id: media?.document?.file_id };
          }
        });

      helpers.storePhoto(username, request_number, JSON.stringify(media));
    } else {
      const photo = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id; // getting the highest resolution photo
      const video = ctx.message?.video?.file_id;
      const document = ctx.message?.document?.file_id;

      let media = [];

      if (photo) {
        media = [{ type: "photo", file_id: photo }];
      }

      if (video) {
        media = [{ type: "video", file_id: video }];
      }

      if (document) {
        media = [{ type: "document", file_id: document }];
      }

      // кейс когда больше 10 файлов
      helpers.storePhoto(username, request_number, JSON.stringify(media));
    }

    ctx.session.current_step = "CREATOR/MAIN_MENU";

    // Присылать менеджеру сообщение что клиент выполнил задание вместо проверки командой
    ctx.reply(
      "The request was sent to the manager",
      Markup.keyboard(["📹 Requests"]).resize()
    );
  }
};

// 1. Рефактор кода и грамотная организация для расширяемости
// 2. Обработка ссылки с контентом - string.include('https') + запись ссылки в базу. Когда менеджер делает /check он видит ссылку
// 3. Open request - список всех открытых заданий
// 4. Approve content (задание отмечается как выполненное + отображается список выполненных заданий по нажатию на Completed requests)
// 5. Redo content (Опишите что нужно переделать -> человек описывает -> предпросмотр задания на переделку (отправить/изменить запрос))

bot.start(async (ctx) => {
  ctx.session.userData = {
    tg_id: ctx.message.from.id,
    tg_username: ctx.message.from?.username,
  };

  const username = ctx.from.username;

  helpers.getUserRole(username, (role) => {
    if (role) {
      ctx.session.userData.role = role;

      if (role === "manager") {
        ctx.session.current_step = "MANAGER/MAIN_MENU";

        ctx.reply(
          `Welcome back, ${username}! Your role is ${role}.`,
          Markup.keyboard([
            ["📹 Request content"],
            ["⏳ Open requests (dev)"],
            ["✅ Completed requests (dev)"],
            // Добавить кнопку перегеристрироваться (на случай если выбрал не то)
          ]).resize()
        );
      }

      if (role === "model") {
        ctx.session.current_step = "CREATOR/MAIN_MENU";

        ctx.reply(
          `Welcome back, ${username}! Your role is ${role}.`,
          // Добавить кнопку перегеристрироваться (на случай если выбрал не то)
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
        ]).resize()
      );
    }
  });
});

bot.on("media_group", (ctx) => {
  uploadContent(ctx);
});

bot.on("photo", (ctx) => {
  uploadContent(ctx);
});

bot.on("video", (ctx) => {
  uploadContent(ctx);
});

bot.on("document", (ctx) => {
  uploadContent(ctx);
});

bot.on("message", async (ctx) => {
  if (ctx.session.current_step === "ROLE_SELECTION") {
    const user = { username: ctx.from.username, id: ctx.from.id };

    if (ctx.message.text === "👱‍♀️ Creator (Will provide content)") {
      ctx.session.current_step = "CREATOR/MAIN_MENU";
      ctx.session.userData.role = "model";

      return helpers.registerUser(user, "model", () => {
        ctx.reply(
          "You have been registered as a Creator.",
          Markup.keyboard(["📹 Requests"]).resize()
        );
      });
    }

    if (ctx.message.text === "👨‍💻 Manager (Will request content)") {
      ctx.session.current_step = "MANAGER/MAIN_MENU";
      ctx.session.userData.role = "manager";

      return helpers.registerUser(user, "manager", () => {
        ctx.reply(
          "You have been registered as a Manager.",
          Markup.keyboard([
            ["📹 Request content"],
            ["⏳ Open requests (dev)"],
            ["✅ Completed requests (dev)"],
          ]).resize()
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

        if (!requests) {
          return ctx.reply("There are no requests");
        }

        return ctx.reply(
          `You have ${requests_count} request(s)
          
${requests
  ?.map(
    (request) =>
      `<strong>№${request.id}</strong> / ${request.models_article} / @${request.requester}\n`
  )
  .join("")}

<i>Use <code>/open number</code> to see more details about the request</i>`,
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
        return ctx.replyWithMarkdown(
          `*Which model or models is this request for?*

_Please note that Creators may not know the model articles, so for your convenience and theirs, please enter it as_

*MO10 (@of_models_username)*
          `
        );
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

    // ctx.session.current_step = следующий шаг;
    return ctx.replyWithMarkdown(
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
          Markup.keyboard([
            ["📹 Request content"],
            ["⏳ Open requests (dev)"],
            ["✅ Completed requests (dev)"],
          ]).resize()
        );
      });
  });
});

//
bot.action("approve_content", (ctx) => {
  ctx.answerCbQuery();
  // выполнить задание как готовое
  // изменить шаг на главное меню
  return ctx.reply("Approved");
});

bot.action("ask_to_redo", (ctx) => {
  ctx.answerCbQuery();
  // просим описать что нужно передать, снова формируем пред просмотр
  // изменить шаг на главное меню
  return ctx.reply("Sent to redoing");
});

//
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

require("dotenv").config();
require("./db");

const { Telegraf, Markup } = require("telegraf");
const LocalSession = require("telegraf-session-local");
const helpers = require("./helpers");
const mediaGroup = require("./media_group");

// Инициализация бота и middleware
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(new LocalSession({ database: "session.json" }).middleware());
bot.use(mediaGroup());

// Обработка команд
bot.command("check", handleCheckCommand);
bot.command("open", handleOpenCommand);
bot.on("media_group", handleUploadContent);
bot.on("photo", handleUploadContent);
bot.on("video", handleUploadContent);
bot.on("document", handleUploadContent);
bot.on("message", handleMessage);

// Запуск бота
bot.start(handleStart);
bot.launch().then(() => console.log("Bot started"));

// Функции обработчики команд
function handleCheckCommand(ctx) {
  if (ctx.session.userData.role === "manager") {
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
      } else {
        ctx.reply("Фотографии для данного пользователя не найдены.");
      }
    });
  } else {
    ctx.reply("The command is available only for Managers");
  }
}

function handleOpenCommand(ctx) {
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
}

function handleUploadContent(ctx) {
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
      const photo = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id;
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

      helpers.storePhoto(username, request_number, JSON.stringify(media));
    }

    ctx.session.current_step = "CREATOR/MAIN_MENU";

    ctx.reply(
      "The request was sent to the manager",
      Markup.keyboard([
        ["📹 Requests"],
        ["🔁 Choose another role"],
      ]).resize()
    );
  }
}

function handleMessage(ctx) {
  const step = ctx.session.current_step;

  if (step === "ROLE_SELECTION") {
    handleRoleSelection(ctx);
  } else if (step === "MANAGER/MAIN_MENU") {
    handleManagerMainMenu(ctx);
  } else if (step === "CREATOR/MAIN_MENU") {
    handleCreatorMainMenu(ctx);
  } else if (step === "CREATOR/UPLOAD_CONTENT") {
    handleCancelUpload(ctx);
  } else if (step === "REQUEST_CONTENT/CREATOR_USERNAME") {
    handleCreatorUsername(ctx);
  } else if (step === "REQUEST_CONTENT/MODELS_ARTICLE") {
    handleModelsArticle(ctx);
  } else if (step === "REQUEST_CONTENT/DESCRIPTION") {
    handleDescription(ctx);
  }

  if (ctx.message.text === "🔁 Choose another role") {
    ctx.session.current_step = "ROLE_SELECTION";
    ctx.session.userData.role = null;

    ctx.reply(
      "Please choose your role:",
      Markup.keyboard([
        ["👱‍♀️ Creator (Will provide content)"],
        ["👨‍💻 Manager (Will request content)"],
      ]).resize()
    );
  }
}

function handleRoleSelection(ctx) {
  const user = { username: ctx.from.username, id: ctx.from.id };

  if (ctx.message.text === "👱‍♀️ Creator (Will provide content)") {
    ctx.session.current_step = "CREATOR/MAIN_MENU";
    ctx.session.userData.role = "model";

    helpers.registerUser(user, "model", () => {
      ctx.reply(
        "You have been registered as a Creator.",
        Markup.keyboard([
          ["📹 Requests"],
          ["🔁 Choose another role"],
        ]).resize()
      );
    });
  }

  if (ctx.message.text === "👨‍💻 Manager (Will request content)") {
    ctx.session.current_step = "MANAGER/MAIN_MENU";
    ctx.session.userData.role = "manager";

    helpers.registerUser(user, "manager", () => {
      ctx.reply(
        "You have been registered as a Manager.",
        Markup.keyboard([
          ["📹 Request content"],
          ["⏳ Open requests (dev)"],
          ["✅ Completed requests (dev)"],
          ["🔁 Choose another role"],
        ]).resize()
      );
    });
  }
}

function handleManagerMainMenu(ctx) {
  if (ctx.message.text === "📹 Request content") {
    ctx.session.current_step = "REQUEST_CONTENT/CREATOR_USERNAME";
    ctx.reply("Enter the username of model's manager", Markup.removeKeyboard());
  }
}

function handleCreatorMainMenu(ctx) {
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

function handleCancelUpload(ctx) {
  if (ctx.message.text === "Cancel") {
    ctx.session.current_step = "CREATOR/MAIN_MENU";
    ctx.reply("Canceled", Markup.keyboard(["📹 Requests"]).resize());
  }
}

function handleCreatorUsername(ctx) {
  helpers.getCreators((creators) => {
    const creator_username = ctx.message.text;
    const creator = creators.find((c) => c.username === creator_username);

    if (creator) {
      ctx.session.userData = { ...ctx.session.userData, creator_username };
      ctx.session.current_step = "REQUEST_CONTENT/MODELS_ARTICLE";
      ctx.replyWithMarkdown(
        `*Which model or models is this request for?*
        
_Please send the name of the model or the name of the article associated with this request_`
      );
    } else {
      ctx.reply("Creator not found. Please check the username and try again.");
    }
  });
}

function handleModelsArticle(ctx) {
  ctx.session.userData = { ...ctx.session.userData, models_article: ctx.message.text };
  ctx.session.current_step = "REQUEST_CONTENT/DESCRIPTION";
  ctx.replyWithMarkdown(
    `*Please describe the content that you need.*
    
_Please provide as many details as possible._`
  );
}

function handleDescription(ctx) {
  const description = ctx.message.text;
  const { creator_username, models_article } = ctx.session.userData;

  const request = {
    id: new Date().getTime(),
    models_article,
    description,
    requester: ctx.chat.username,
    status: "open",
  };

  helpers.addRequestToCreator(creator_username, request);

  ctx.session.current_step = "MANAGER/MAIN_MENU";

  ctx.reply(
    `The request was sent to the manager.`,
    Markup.keyboard([
      ["📹 Request content"],
      ["⏳ Open requests (dev)"],
      ["✅ Completed requests (dev)"],
      ["🔁 Choose another role"],
    ]).resize()
  );
}

function handleStart(ctx) {
  ctx.session.current_step = "ROLE_SELECTION";
  ctx.reply(
    "Please choose your role:",
    Markup.keyboard([
      ["👱‍♀️ Creator (Will provide content)"],
      ["👨‍💻 Manager (Will request content)"],
    ]).resize()
  );
}


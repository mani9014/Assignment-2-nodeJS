const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Error message:${e.message}`);
  }
};
initializeDBAndServer();
// AUTHENTICATION TOKEN
const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //console.log(payload);
        request.payload = payload;
        request.tweet = tweet;
        request.tweetId = tweetId;
        next();
      }
    });
  }
};
//Register User API-1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      const createUserQuery = `
         INSERT INTO user(name,username,password,gender)
         VAlUES(
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
            );
        `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  }
});

//User Login API-2.
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT * FROM user WHERE username='${username}';
  `;
  const dbUser = await db.get(selectUserQuery);
  //console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      // const payload = { username: username };
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      // console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//User Tweets Feed API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetFeedQuery = `
        SELECT 
            username,
            tweet,
            date_time AS dateTime
        FROM 
            follower 
        INNER JOIN 
            tweet
        ON
            follower.following_user_id=tweet.user_id INNER JOIN user 
        ON
            user.user_id=follower.following_user_id
        WHERE
            follower.follower_user_id=${user_id}
        ORDER BY 
            date_time DESC
        LIMIT 4;`;
  const tweetFeedArray = await db.all(getTweetFeedQuery);
  response.send(tweetFeedArray);
});

//Get Following User Names API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowingQuery = `
            SELECT 
                name
            FROM
                user
            INNER JOIN 
                follower
            ON 
                user.user_id=follower.following_user_id
            WHERE
                follower.follower_user_id=${user_id};
        `;
  const userFollowsArray = await db.all(userFollowingQuery);
  response.send(userFollowsArray);
});

//Get User Names Followers API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const userFollowersQuery = `
            SELECT 
                name
            FROM
                user
            INNER JOIN 
                follower
            ON 
                user.user_id=follower.follower_user_id
            WHERE
                follower.following_user_id=${user_id};
        `;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);
});

//Get Tweet API-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetsQuery = `
        SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsResult = await db.get(tweetsQuery);
  //response.send(tweetsResult);
  const userFollowersQuery = `
            SELECT 
                *
            FROM
                user
            INNER JOIN 
                follower
            ON 
                user.user_id=follower.following_user_id
            WHERE
                follower.follower_user_id=${user_id};
`;
  const userFollowers = await db.all(userFollowersQuery);
  //response.send(userFollowers);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    const getTweetDetailsQuery = `
                SELECT
                    tweet,
                    COUNT(DISTINCT(like.like_id)) AS likes,
                    COUNT(DISTINCT(reply.reply_id)) AS replies,
                    tweet.date_time AS dateTime
                FROM
                    tweet 
                INNER JOIN 
                    like
                ON
                    tweet.tweet_id=like.tweet_id INNER JOIN reply
                ON 
                    reply.tweet_id=tweet.tweet_id
                WHERE
                    tweet.tweet_id=${tweetId} AND tweet.user_id=${userFollowers[0].user_id};
        `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Get tweets liked users API-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikedUsersQuery = `
            SELECT 
                *
            FROM
                follower 
            INNER JOIN
                tweet
            ON
                tweet.user_id=follower.following_user_id INNER JOIN like
            ON
                like.tweet_id=tweet.tweet_id
            INNER JOIN
                user 
            ON
                user.user_id=like.user_id
            WHERE
                tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};
    `;
    const likedUsers = await db.all(getLikedUsersQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get tweet replied users API-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const getRepliesUsersQuery = `
        SELECT 
            *
        FROM
            follower
        INNER JOIN 
            tweet
        ON
            tweet.user_id=follower.following_user_id 
        INNER JOIN 
            reply
        ON
            reply.tweet_id=tweet.tweet_id
        INNER JOIN
            user
        ON 
            user.user_id=reply.user_id
        WHERE
            tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};
    `;
    const repliedUsers = await db.all(getRepliesUsersQuery);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Get All Tweet of user API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetDetailsQuery = `
                SELECT
                    tweet.tweet AS tweet,
                    COUNT(DISTINCT(like.like_id)) AS likes,
                    COUNT(DISTINCT(reply.reply_id)) AS replies,
                    tweet.date_time AS dateTime
                FROM
                    tweet
                INNER JOIN
                    like
                ON 
                    tweet.tweet_id=like.tweet_id
                INNER JOIN
                    reply 
                ON 
                    reply.tweet_id=tweet.tweet_id
                INNER JOIN 
                    user
                ON 
                    tweet.user_id=user.user_id
                WHERE
                    user.user_id=${user_id}
                GROUP BY
                    tweet.tweet_id;
        `;
  const tweetDetails = await db.all(getTweetDetailsQuery);
  response.send(tweetDetails);
});

//Get Post Tweet API-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const postTweetQuery = `
    INSERT INTO tweet(tweet,user_id)
    VALUES(
        '${tweet}',
        ${user_id}
    );
  `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//Delete Tweet API-11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    const selectUserQuery = `
            SELECT 
                *
            FROM
                tweet
            WHERE
                tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};
            
    `;
    const tweetUser = await db.all(selectUserQuery);
    if (tweetUser.length !== 0) {
      const deleteTweetQuery = `
            DELETE FROM tweet
            WHERE 
                tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
//Exporting Express Instance
module.exports = app;

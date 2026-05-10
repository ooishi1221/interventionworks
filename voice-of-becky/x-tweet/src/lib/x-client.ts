import { TwitterApi } from "twitter-api-v2";

let client: TwitterApi | null = null;

function getClient(): TwitterApi {
  if (client) return client;

  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      "X API credentials not configured. Check .env: X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET"
    );
  }

  client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret: accessTokenSecret,
  });
  return client;
}

export interface PostTweetResult {
  success: boolean;
  tweetId?: string;
  text: string;
  dryRun: boolean;
  error?: string;
}

export function isDryRun(): boolean {
  return process.env.X_TWEET_DRY_RUN === "true";
}

let cachedUserId: string | null = null;

export async function getMyUserId(): Promise<string> {
  const envUserId = process.env.X_USER_ID;
  if (envUserId) return envUserId;
  if (cachedUserId) return cachedUserId;

  const c = getClient();
  const me = await c.v2.userByUsername("intervention_jp");
  if (!me.data?.id) {
    throw new Error("Failed to resolve @intervention_jp user ID via API");
  }
  cachedUserId = me.data.id;
  return cachedUserId;
}

export interface MentionItem {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  createdAt: string;
  url: string;
}

export async function getMentions(options: {
  sinceId?: string;
  maxResults?: number;
}): Promise<MentionItem[]> {
  const c = getClient();
  const userId = await getMyUserId();

  const params: Record<string, unknown> = {
    max_results: options.maxResults ?? 10,
    expansions: ["author_id"],
    "tweet.fields": ["created_at", "author_id"],
    "user.fields": ["username", "name"],
  };
  if (options.sinceId) {
    params.since_id = options.sinceId;
  }

  const result = await c.v2.userMentionTimeline(userId, params);

  const usersMap = new Map<string, { username?: string; name?: string }>(
    (result.includes?.users ?? []).map((u) => [u.id, u])
  );

  return (result.tweets ?? []).map((tweet) => {
    const user = usersMap.get(tweet.author_id ?? "") ?? {};
    return {
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id ?? "",
      authorUsername: user.username ?? "",
      authorName: user.name ?? "",
      createdAt: tweet.created_at ?? "",
      url: user.username
        ? `https://x.com/${user.username}/status/${tweet.id}`
        : `https://x.com/i/status/${tweet.id}`,
    };
  });
}

export async function postTweet(
  text: string,
  replyTo?: string
): Promise<PostTweetResult> {
  if (isDryRun()) {
    return {
      success: true,
      text,
      dryRun: true,
    };
  }

  try {
    const c = getClient();
    const result = await c.v2.tweet(
      text,
      replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : undefined
    );
    return {
      success: true,
      tweetId: result.data.id,
      text,
      dryRun: false,
    };
  } catch (error) {
    return {
      success: false,
      text,
      dryRun: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

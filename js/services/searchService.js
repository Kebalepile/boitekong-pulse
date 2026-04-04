import { getUsers } from "./userService.js";
import { getPosts } from "./postService.js";
import { findUserById } from "./userService.js";

function normalizeSearchTerm(value) {
  return value.trim().toLocaleLowerCase();
}

export function searchUsers(query) {
  const normalizedQuery = normalizeSearchTerm(query);

  if (!normalizedQuery) {
    return [];
  }

  const users = getUsers();

  return users.filter((user) =>
    user.username.toLocaleLowerCase().includes(normalizedQuery)
  );
}

export function searchPosts(query) {
  const normalizedQuery = normalizeSearchTerm(query);

  if (!normalizedQuery) {
    return [];
  }

  const posts = getPosts();

  return posts.filter((post) => {
    const author = findUserById(post.userId);

    const haystack = [
      post.content,
      post.location?.township || "",
      post.location?.extension || "",
      author?.username || ""
    ]
      .join(" ")
      .toLocaleLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
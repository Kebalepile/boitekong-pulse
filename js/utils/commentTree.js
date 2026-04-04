export function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    byId.set(comment.id, {
      ...comment,
      children: []
    });
  });

  byId.forEach((commentNode) => {
    if (commentNode.parentId && byId.has(commentNode.parentId)) {
      byId.get(commentNode.parentId).children.push(commentNode);
    } else {
      roots.push(commentNode);
    }
  });

  return sortCommentNodes(roots);
}

function sortByCreatedAtAsc(a, b) {
  return new Date(a.createdAt) - new Date(b.createdAt);
}

function sortCommentNodes(nodes) {
  nodes.sort(sortByCreatedAtAsc);
  nodes.forEach((node) => {
    sortCommentNodes(node.children);
  });

  return nodes;
}

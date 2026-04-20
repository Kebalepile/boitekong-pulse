export function createUnboundModelPlaceholder({ modelName, collectionName = "" }) {
  const placeholder = {
    modelName,
    collection: {
      collectionName: collectionName || modelName
    }
  };

  return new Proxy(placeholder, {
    get(target, property) {
      if (property in target) {
        return target[property];
      }

      return function unboundModelMethod() {
        throw new Error(
          `${modelName} model is not bound to a database connection yet.`
        );
      };
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

export function bindConnectionModel(connection, modelName, schema) {
  if (!connection) {
    throw new Error(`Cannot bind ${modelName} without a database connection.`);
  }

  return connection.models[modelName] || connection.model(modelName, schema);
}

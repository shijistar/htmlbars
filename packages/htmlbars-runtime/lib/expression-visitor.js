import { merge, createObject } from "../htmlbars-util/object-utils";
import { validateChildMorphs, linkParams } from "../htmlbars-util/morph-utils";

/**
  Node classification:

  # Primary Statement Nodes:

  These nodes are responsible for a render node that represents a morph-range.

  * block
  * inline
  * content
  * element
  * component

  # Leaf Statement Nodes:

  This node is responsible for a render node that represents a morph-attr.

  * attribute

  # Expression Nodes:

  These nodes are not directly responsible for any part of the DOM, but are
  eventually passed to a Statement Node.

  * get
  * subexpr
  * concat
*/

var base = {
  accept: function(node, morph, env, scope, template, visitor) {
    // Primitive literals are unambiguously non-array representations of
    // themselves.
    if (typeof node !== 'object') {
      return node;
    }

    switch(node[0]) {
      case 'get': return this.get(node, morph, env, scope);
      case 'subexpr': return this.subexpr(node, morph, env, scope);
      case 'concat': return this.concat(node, morph, env, scope);
      case 'block': return this.block(node, morph, env, scope, template, visitor);
      case 'inline': return this.inline(node, morph, env, scope, visitor);
      case 'content': return this.content(node, morph, env, scope, visitor);
      case 'element': return this.element(node, morph, env, scope, template, visitor);
      case 'attribute': return this.attribute(node, morph, env, scope);
      case 'component': return this.component(node, morph, env, scope, template, visitor);
    }
  },

  acceptParamsAndHash: function(env, scope, morph, path, params, hash) {
    params = params && this.acceptParams(params, morph, env, scope);
    hash = hash && this.acceptHash(hash, morph, env, scope);

    linkParams(env, scope, morph, path, params, hash);
    return [params, hash];
  },

  acceptParams: function(nodes, morph, env, scope) {
    if (morph.linkedParams) {
      return morph.linkedParams.params;
    }

    var arr = new Array(nodes.length);

    for (var i=0, l=nodes.length; i<l; i++) {
      arr[i] =  this.accept(nodes[i], morph, env, scope, null, null);
    }

    return arr;
  },

  acceptHash: function(pairs, morph, env, scope) {
    if (morph.linkedParams) {
      return morph.linkedParams.hash;
    }

    var object = {};

    for (var i=0, l=pairs.length; i<l; i += 2) {
      object[pairs[i]] = this.accept(pairs[i+1], morph, env, scope, null, null);
    }

    return object;
  },

  // [ 'get', path ]
  get: function(node, morph, env, scope) {
    return env.hooks.get(env, scope, node[1]);
  },

  // [ 'subexpr', path, params, hash ]
  subexpr: function(node, morph, env, scope) {
    var path = node[1], params = node[2], hash = node[3];
    return env.hooks.subexpr(env, scope, path,
                             this.acceptParams(params, morph, env, scope),
                             this.acceptHash(hash, morph, env, scope));
  },

  // [ 'concat', parts ]
  concat: function(node, morph, env, scope) {
    return env.hooks.concat(env, this.acceptParams(node[1], morph, env, scope));
  }
};

export var AlwaysDirtyVisitor = merge(createObject(base), {
  // [ 'block', path, params, hash, templateId, inverseId ]
  block: function(node, morph, env, scope, template, visitor) {
    var path = node[1], params = node[2], hash = node[3], templateId = node[4], inverseId = node[5];
    var paramsAndHash = this.acceptParamsAndHash(env, scope, morph, path, params, hash);

    env.hooks.block(morph, env, scope, path, paramsAndHash[0], paramsAndHash[1],
                           templateId === null ? null : template.templates[templateId],
                           inverseId === null ? null : template.templates[inverseId],
                           visitor);
  },

  // [ 'inline', path, params, hash ]
  inline: function(node, morph, env, scope, visitor) {
    var path = node[1], params = node[2], hash = node[3];
    var paramsAndHash = this.acceptParamsAndHash(env, scope, morph, path, params, hash);

    env.hooks.inline(morph, env, scope, path, paramsAndHash[0], paramsAndHash[1], visitor);
  },

  // [ 'content', path ]
  content: function(node, morph, env, scope, visitor) {
    var path = node[1];

    if (isHelper(env, scope, path)) {
      env.hooks.inline(morph, env, scope, path, [], {}, visitor);
      return;
    }

    var params;
    if (morph.linkedParams) {
      params = morph.linkedParams.params;
    } else {
      params = [env.hooks.get(env, scope, path)];
    }

    linkParams(env, scope, morph, '@range', params, null);
    env.hooks.range(morph, env, scope, params[0]);
  },

  // [ 'element', path, params, hash ]
  element: function(node, morph, env, scope, visitor) {
    var path = node[1], params = node[2], hash = node[3];
    var paramsAndHash = this.acceptParamsAndHash(env, scope, morph, path, params, hash);

    env.hooks.element(morph, env, scope, path, paramsAndHash[0], paramsAndHash[1], visitor);
  },

  // [ 'attribute', name, value ]
  attribute: function(node, morph, env, scope) {
    var name = node[1], value = node[2];
    var paramsAndHash = this.acceptParamsAndHash(env, scope, morph, '@attribute', [value], null);

    env.hooks.attribute(morph, env, scope, name, paramsAndHash[0][0]);
  },

  // [ 'component', path, attrs, templateId ]
  component: function(node, morph, env, scope, template, visitor) {
    var path = node[1], attrs = node[2], templateId = node[3];
    var paramsAndHash = this.acceptParamsAndHash(env, scope, morph, path, null, attrs);

    env.hooks.component(morph, env, scope, path, paramsAndHash[1],
                        template.templates[templateId], visitor);
  }
});

export default merge(createObject(base), {
  // [ 'block', path, params, hash, templateId, inverseId ]
  block: function(node, morph, env, scope, template, visitor) {
    if (morph.isDirty) {
      this.dirtyBlock(node, morph, env, scope, template, visitor);
      morph.isDirty = false;
    } else {
      validateChildMorphs(env, morph, visitor);
    }
  },

  dirtyBlock: AlwaysDirtyVisitor.block,

  // [ 'inline', path, params, hash ]
  inline: function(node, morph, env, scope, visitor) {
    if (morph.isDirty) {
      this.dirtyInline(node, morph, env, scope, visitor);
      morph.isDirty = false;
    } else {
      validateChildMorphs(env, morph, visitor);
    }
  },

  dirtyInline: AlwaysDirtyVisitor.inline,

  // [ 'content', path ]
  content: function(node, morph, env, scope, visitor) {
    if (morph.isDirty) {
      env.hooks.content(morph, env, scope, node[1], visitor);
      morph.isDirty = false;
    } else {
      validateChildMorphs(env, morph, visitor);
    }
  },

  // [ 'element', path, params, hash ]
  element: function(node, morph, env, scope, template, visitor) {
    if (morph.isDirty) {
      this.dirtyElement(node, morph, env, scope, template, visitor);
      morph.isDirty = false;
    } else {
      validateChildMorphs(env, morph, visitor);
    }
  },

  dirtyElement: AlwaysDirtyVisitor.element,

  // [ 'attribute', name, value ]
  attribute: function(node, morph, env, scope, template) {
    if (morph.isDirty) {
      this.dirtyAttribute(node, morph, env, scope, template);
      morph.isDirty = false;
    }
  },

  dirtyAttribute: AlwaysDirtyVisitor.attribute,

  // [ 'component', path, attrs, templateId ]
  component: function(node, morph, env, scope, template, visitor) {
    if (morph.isDirty) {
      this.dirtyComponent(node, morph, env, scope, template, visitor);
      morph.isDirty = false;
    } else {
      validateChildMorphs(env, morph, visitor);
    }
  },

  dirtyComponent: AlwaysDirtyVisitor.component
});

function isHelper(env, scope, path) {
  return (env.hooks.keywords[path] !== undefined) || env.hooks.hasHelper(env, scope, path);
}

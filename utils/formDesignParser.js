// Shared parser: parse form_design tree into ordered questions array
export const parseFormDesignToQuestions = (
  form_design,
  questionsArray = []
) => {
  const questionsMap = {};
  (questionsArray || []).forEach((q) => {
    if (q && (q.id || q._id)) questionsMap[q.id || q._id] = q;
  });

  const result = [];
  const seen = new Set();

  const getProps = (node) => (node && node.props) || {};

  // traverse supports passing parent context (e.g. insideRepeater)
  const traverse = (node, context = {}) => {
    if (!node) return;

    // If node itself references a question id in props or linkExternalId
    const props = getProps(node);
    const qid =
      props.question ||
      props.question_id ||
      props.questionId ||
      node.linkExternalId ||
      props.linkExternalId ||
      null;

    // helper: derive question_type from node.type or base
    const deriveTypeFromNode = (n, base) => {
      const nt =
        (n && n.type) || (base && (base.question_type || base.type)) || "text";
      // map common design types to internal question_type
      if (typeof nt === "string") {
        const lower = nt.toLowerCase();
        if (lower === "input" || lower === "text" || lower === "textarea")
          return base.question_type || "text";
        // The backend now uses 'select' for tables - map to our table picker
        if (lower === "select") return base.question_type || "table";
        if (
          lower === "multiselect" ||
          lower === "checkbox" ||
          lower === "checkboxes"
        )
          return base.question_type || "multiple_choice";
        // repeater is a container; don't map it to "table" here. Let children be parsed instead.
        if (lower === "table" || lower === "repeat")
          return base.question_type || "table";
        if (lower === "date") return "date";
        if (lower === "file") return "file";
        if (lower === "number") return "number";
        if (lower === "location") return "location";
        if (lower === "signature" || lower === "firm") return "firm";
      }
      return base.question_type || "text";
    };

    if (qid && !seen.has(qid)) {
      seen.add(qid);
      const base = questionsMap[qid] || {};

      // determine type and options conservatively
      const qType = deriveTypeFromNode(node, base);
      let opts = [];
      if (Array.isArray(base.options) && base.options.length > 0) {
        opts = base.options.map((o) => (o && o.option_text) || o);
      } else if (Array.isArray(props.options) && props.options.length > 0) {
        opts = props.options.map((o) => (o && o.option_text) || o);
      } else if (Array.isArray(node.options) && node.options.length > 0) {
        opts = node.options.map((o) => (o && o.option_text) || o);
      }

      const merged = {
        ...base,
        id: qid,
        question_type: qType,
        options: opts,
        parentId:
          node.parentId ||
          props.parentId ||
          base.parentId ||
          node.parent ||
          props.parent ||
          null,
      };

      // If current traversal is inside a repeater context, mark as repeated
      if (context && context.inRepeater) {
        merged.is_repeated = true;
      }

      result.push(merged);
    } else if (!qid) {
      // No external question reference: create a synthetic question from node props
      const nodeId = node.id || (props && (props.id || props._id));
      // only create if node has a label/placeholder/options or an id and is not a container (repeater)
      const hasLabel =
        props &&
        (props.label || props.title || props.content || props.placeholder);
      const hasOptions =
        Array.isArray(props.options) && props.options.length > 0;
      const isContainer =
        node.type && String(node.type).toLowerCase() === "repeater";
      if (
        nodeId &&
        !seen.has(nodeId) &&
        (hasLabel || hasOptions) &&
        !isContainer
      ) {
        seen.add(nodeId);
        const syntheticType = deriveTypeFromNode(node, {});
        const opts = hasOptions
          ? props.options.map((o) => (o && o.option_text) || o)
          : [];
        const synthetic = {
          id: nodeId,
          question_type: syntheticType,
          question_text: props.label || props.title || props.content || "",
          placeholder: props.placeholder || null,
          options: opts,
          parentId:
            node.parentId ||
            props.parentId ||
            node.parent ||
            props.parent ||
            null,
        };
        if (context && context.inRepeater) synthetic.is_repeated = true;
        result.push(synthetic);
      }
    }

    // Recurse into children (support different shapes). If this node is a repeater, set inRepeater context
    const children = node.children || props.children || props.elements || [];
    const nextContext = {
      ...context,
      inRepeater:
        context.inRepeater ||
        (node.type && String(node.type).toLowerCase() === "repeater"),
    };
    if (Array.isArray(children)) {
      children.forEach((child) => traverse(child, nextContext));
    } else if (children) {
      traverse(children, nextContext);
    }
  };

  if (Array.isArray(form_design)) {
    form_design.forEach(traverse);
  } else {
    traverse(form_design);
  }

  // Fallback: if nothing found, return questionsArray transformed like before
  if (result.length === 0 && Array.isArray(questionsArray)) {
    return questionsArray.map((question) => {
      if (
        (question.question_type === "multiple_choice" ||
          question.question_type === "one_choice") &&
        Array.isArray(question.options)
      ) {
        return {
          ...question,
          options: question.options.map(
            (option) => option.option_text || option
          ),
        };
      }
      if (question.question_type === "table") {
        return { ...question, options: [] };
      }
      return question;
    });
  }

  return result;
};

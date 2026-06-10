/**
 * Utility to filter content based on professionalism/entertainment classification.
 * Matches the logic used in the Spatial Knowledge Graph and Catalog.
 */

/**
 * Checks if a name or text string is classified as entertainment/RPG content.
 */
export const checkIsEntertainment = (text) => {
  if (!text) return false;
  const n = text.toLowerCase();
  
  // High-precision regex for common RPG/Gaming terms
  const entertainmentRegex = /\b(rpg|roleplaying|role-playing|role playing|boardgame|board game|gaming|tabletop|hobby|fantasy|dungeon|dragon|quest|campaign|rulebook|playbook|adventure|scenario|starter set|wargame|miniature|games|wargaming|character|dice|encounter|bestiary|grimoire|warband|bushido|campfire|dead world|parsec|borderland|no quarter|starship|gang warfare|salvage crew)\w*/i;
  
  return entertainmentRegex.test(n);
};

/**
 * Filters a hierarchical tree node based on chat tone.
 * If tone is 'professional', it prunes entertainment branches.
 */
export const filterTreeNode = (node, chatTone, searchQuery = '') => {
  if (!node) return null;
  
  const isProfessional = chatTone === 'professional';
  const query = searchQuery.toLowerCase();

  // Helper for recursive filtering
  const processNode = (n) => {
    // 1. Unconditionally skip entertainment/RPG nodes
    if (checkIsEntertainment(n.name) || checkIsEntertainment(n.subject)) {
      return null;
    }

    // 2. Filter children
    let filteredChildren = [];
    if (n.children) {
      filteredChildren = n.children
        .map(child => processNode(child))
        .filter(child => child !== null);
    }

    // 3. Check if current node matches search query
    const matchesSearch = query === '' || 
      (n.name && n.name.toLowerCase().includes(query)) ||
      (n.subject && n.subject.toLowerCase().includes(query)) ||
      (n.themes && n.themes.toLowerCase().includes(query));

    // 4. Return node if it matches OR has matching children
    if (matchesSearch || filteredChildren.length > 0) {
      return {
        ...n,
        children: filteredChildren
      };
    }

    return null;
  };

  return processNode(node);
};

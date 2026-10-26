// Filtros de acesso do painel pelos produtos e canais do usuario.
export function createScopeHelpers(db) {
  const allowedProducts = req =>
    req.scopes.all
      ? db.prepare('SELECT * FROM product ORDER BY name').all()
      : db
          .prepare(
            'SELECT p.* FROM product p JOIN user_product up ON up.product_id=p.id WHERE up.user_id=? ORDER BY p.name'
          )
          .all(req.user.id);
  const allowedProductCodes = req => allowedProducts(req).map(p => p.code);
  function canAccessTerminal(req, terminal) {
    const product = db.prepare('SELECT id FROM product WHERE code=?').get(terminal.product_code);
    return (
      req.scopes.all ||
      Boolean(product && req.scopes.productIds.includes(product.id) && req.scopes.channels.includes(terminal.channel))
    );
  }
  return { allowedProducts, allowedProductCodes, canAccessTerminal };
}


export function createMarketplace(db) {
  return {
    async categories() {
      return db.all(`
        SELECT ID, NAME, EMOJI, SORT_ORDER
        FROM GB_CATEGORIES
        WHERE ACTIVE = 1
        ORDER BY SORT_ORDER
      `);
    },

    async subcategories(categoryId) {
      const id = Number(categoryId);

      if (!Number.isInteger(id) || id < 1 || id > 11) {
        throw new Error('Invalid product type.');
      }

      return db.all(`
        SELECT ID, CATEGORY_ID, NAME, SORT_ORDER
        FROM GB_SUBCATEGORIES
        WHERE CATEGORY_ID = :id
          AND ACTIVE = 1
        ORDER BY SORT_ORDER
      `, { id });
    },

    async listings(filters = {}) {
      const conditions = [
        "l.LISTING_STATUS = 'available'"
      ];
      const binds = {};

      if (filters.categoryId !== undefined && filters.categoryId !== '') {
        const id = Number(filters.categoryId);
        if (!Number.isInteger(id) || id < 1 || id > 11) {
          throw new Error('Invalid product type.');
        }
        conditions.push('l.CATEGORY_ID = :categoryId');
        binds.categoryId = id;
      }

      if (filters.subcategoryId !== undefined && filters.subcategoryId !== '') {
        const id = Number(filters.subcategoryId);
        if (!Number.isInteger(id) || id < 1) {
          throw new Error('Invalid sub-type.');
        }
        conditions.push('l.SUBCATEGORY_ID = :subcategoryId');
        binds.subcategoryId = id;
      }

      if (filters.condition) {
        const value = String(filters.condition).toLowerCase();
        if (!['very_good', 'good', 'fair'].includes(value)) {
          throw new Error('Invalid condition.');
        }
        conditions.push('l.ITEM_CONDITION = :condition');
        binds.condition = value;
      }

      if (filters.gender) {
        const value = String(filters.gender);
        if (!['Boy', 'Girl', 'Unisex'].includes(value)) {
          throw new Error('Invalid gender filter.');
        }
        conditions.push('l.GENDER = :gender');
        binds.gender = value;
      }

      if (filters.size) {
        const value = String(filters.size).trim().slice(0, 50);
        conditions.push('LOWER(l.ITEM_SIZE) = LOWER(:itemSize)');
        binds.itemSize = value;
      }

      if (filters.postcode) {
        const value = String(filters.postcode).trim();
        if (!/^\d{4}$/.test(value)) {
          throw new Error('Enter a valid four-digit Swiss postcode.');
        }
        conditions.push('l.POSTCODE = :postcode');
        binds.postcode = value;
      }

      if (filters.twintAvailable !== undefined &&
          filters.twintAvailable !== '') {
        if (!['0', '1', 0, 1].includes(filters.twintAvailable)) {
          throw new Error('Invalid TWINT filter.');
        }
        conditions.push('l.TWINT_AVAILABLE = :twint');
        binds.twint = Number(filters.twintAvailable);
      }

      return db.all(`
        SELECT
          l.ID,
          l.TITLE,
          l.DESCRIPTION,
          l.CATEGORY_ID,
          c.NAME AS CATEGORY_NAME,
          c.EMOJI AS CATEGORY_EMOJI,
          l.SUBCATEGORY_ID,
          s.NAME AS SUBCATEGORY_NAME,
          l.ITEM_CONDITION,
          l.GENDER,
          l.IMAGE1_PATH,
          l.IMAGE2_PATH,
          l.ITEM_SIZE,
          l.POSTCODE,
          l.TWINT_AVAILABLE,
          l.PRICE_CHF,
          l.CREATED_AT
        FROM GB_LISTINGS l
        JOIN GB_CATEGORIES c ON c.ID = l.CATEGORY_ID
        LEFT JOIN GB_SUBCATEGORIES s
          ON s.ID = l.SUBCATEGORY_ID
         AND s.CATEGORY_ID = l.CATEGORY_ID
        WHERE ${conditions.join(' AND ')}
        ORDER BY l.CREATED_AT DESC
        FETCH FIRST 100 ROWS ONLY
      `, binds);
    }
  };
}

import fs from 'node:fs';
import path from 'node:path';

const diagramId = 'chart_mv00n7vwm6ao';
const targetFile = path.resolve('.flowcraft', 'diagrams', `${diagramId}.json`);

// 1. Помощник для создания поддиаграммы сущности с радиальной раскладкой атрибутов
function createSubDiagramForEntity(entityId, entityLabel, attributesDef) {
  const centralNode = {
    id: entityId,
    label: entityLabel,
    shape: 'entity',
    x: 600,
    y: 450,
    width: 190,
    height: 65,
    style: {}
  };

  const nodes = [centralNode];
  const edges = [];

  const mainAttrs = attributesDef;
  const count = mainAttrs.length;
  const radius = Math.max(260, count * 36);

  mainAttrs.forEach((attr, idx) => {
    const angle = (idx / count) * 2 * Math.PI - Math.PI / 2;
    const ax = Math.round(600 + Math.cos(angle) * radius);
    const ay = Math.round(450 + Math.sin(angle) * (radius * 0.85));

    const attrNode = {
      id: attr.id,
      label: attr.label,
      shape: 'attribute',
      x: ax - 65,
      y: ay - 25,
      width: 130,
      height: 50,
      style: {
        isKey: !!attr.isKey,
        isMultivalued: !!attr.isMultivalued,
        isDerived: !!attr.isDerived
      }
    };
    nodes.push(attrNode);

    edges.push({
      id: `edge_${entityId}_${attr.id}`,
      source: entityId,
      target: attr.id,
      style: { routing: 'straight', arrowEnd: false }
    });

    // Составные под-атрибуты
    if (attr.subAttributes && attr.subAttributes.length > 0) {
      const subCount = attr.subAttributes.length;
      const subRadius = 140;
      attr.subAttributes.forEach((sub, sIdx) => {
        const spread = (sIdx - (subCount - 1) / 2) * 0.55;
        const subAngle = angle + spread;
        const sax = Math.round(ax + Math.cos(subAngle) * subRadius);
        const say = Math.round(ay + Math.sin(subAngle) * subRadius);

        const subNode = {
          id: sub.id,
          label: sub.label,
          shape: 'attribute',
          x: sax - 55,
          y: say - 22,
          width: 110,
          height: 44,
          style: {}
        };
        nodes.push(subNode);

        edges.push({
          id: `edge_${attr.id}_${sub.id}`,
          source: attr.id,
          target: sub.id,
          style: { routing: 'straight', arrowEnd: false }
        });
      });
    }
  });

  return { nodes, edges };
}

// 2. Описание всех 11 сущностей:
const ENTITY_SPECS = [
  // Поставщик (левая колонка, Y=150)
  {
    id: 'ent_supplier',
    label: 'Поставщик',
    x: 100,
    y: 150,
    width: 190,
    attrs: [
      { id: 'attr_sup_inn', label: 'инн', isKey: true },
      { id: 'attr_sup_kpp', label: 'кпп' },
      { id: 'attr_sup_name', label: 'наименование_организации' },
      {
        id: 'attr_sup_legal_addr',
        label: 'юридический_адрес',
        subAttributes: [
          { id: 'attr_sup_city', label: 'город' },
          { id: 'attr_sup_street', label: 'улица' },
          { id: 'attr_sup_house', label: 'дом' }
        ]
      },
      {
        id: 'attr_sup_bank_acc',
        label: 'банковский_счет',
        subAttributes: [
          { id: 'attr_sup_acc', label: 'расчетный_счет' },
          { id: 'attr_sup_bik', label: 'бик' }
        ]
      },
      { id: 'attr_sup_phone', label: 'телефон' },
      { id: 'attr_sup_contract', label: 'номер_договора' }
    ]
  },
  // Накладная (центр, уровень 1)
  {
    id: 'ent_invoice',
    label: 'Накладная',
    x: 770,
    y: 150,
    width: 190,
    attrs: [
      { id: 'attr_inv_num', label: 'номер_накладной', isKey: true },
      { id: 'attr_inv_date', label: 'дата_составления' },
      { id: 'attr_inv_ksu', label: 'номер_записи_ксу' },
      { id: 'attr_inv_qty', label: 'общее_количество_экземпляров' },
      { id: 'attr_inv_sum', label: 'общая_сумма' }
    ]
  },
  // Издание (правая колонка, уровень 1)
  {
    id: 'ent_edition',
    label: 'Издание',
    x: 1500,
    y: 150,
    width: 190,
    attrs: [
      { id: 'attr_ed_isbn', label: 'isbn', isKey: true },
      { id: 'attr_ed_title', label: 'заглавие' },
      { id: 'attr_ed_part', label: 'том_или_часть' },
      { id: 'attr_ed_authors', label: 'авторы', isMultivalued: true },
      {
        id: 'attr_ed_imprint',
        label: 'выходные_данные',
        subAttributes: [
          { id: 'attr_ed_city', label: 'город' },
          { id: 'attr_ed_pub', label: 'издательство' },
          { id: 'attr_ed_year', label: 'год_издания' }
        ]
      },
      { id: 'attr_ed_pages', label: 'количество_страниц' },
      {
        id: 'attr_ed_shelf',
        label: 'шифр_хранения',
        subAttributes: [
          { id: 'attr_ed_bbk', label: 'индекс_ббк' },
          { id: 'attr_ed_khav', label: 'авторский_знак_хавкиной' }
        ]
      },
      { id: 'attr_ed_abstract', label: 'аннотация' }
    ]
  },
  // Акт о расхождениях (центр, уровень 2)
  {
    id: 'ent_discrepancy',
    label: 'Акт_О_Расхождениях',
    x: 770,
    y: 420,
    width: 210,
    attrs: [
      { id: 'attr_disc_num', label: 'номер_акта', isKey: true },
      { id: 'attr_disc_date', label: 'дата_акта' },
      { id: 'attr_disc_type', label: 'вид_расхождения' },
      { id: 'attr_disc_doc_qty', label: 'количество_по_документам' },
      { id: 'attr_disc_fact_qty', label: 'фактическое_количество' },
      { id: 'attr_disc_price', label: 'цена' },
      { id: 'attr_disc_shortage', label: 'сумма_недостачи', isDerived: true },
      { id: 'attr_disc_defects', label: 'описание_дефектов' }
    ]
  },
  // Сотрудник (левая колонка, центр координации операций)
  {
    id: 'ent_employee',
    label: 'Сотрудник',
    x: 100,
    y: 850,
    width: 190,
    attrs: [
      { id: 'attr_emp_id', label: 'табельный_номер', isKey: true },
      {
        id: 'attr_emp_fio',
        label: 'фио',
        subAttributes: [
          { id: 'attr_emp_last', label: 'фамилия' },
          { id: 'attr_emp_first', label: 'имя' },
          { id: 'attr_emp_mid', label: 'отчество' }
        ]
      },
      { id: 'attr_emp_pos', label: 'должность' },
      { id: 'attr_emp_phone', label: 'телефон' }
    ]
  },
  // Экземпляр (правая колонка, физический фонд)
  {
    id: 'ent_copy',
    label: 'Экземпляр',
    x: 1500,
    y: 850,
    width: 190,
    attrs: [
      { id: 'attr_copy_inv', label: 'инвентарный_номер', isKey: true },
      { id: 'attr_copy_cost', label: 'балансовая_стоимость' },
      { id: 'attr_copy_status', label: 'текущий_статус' }
    ]
  },
  // Место хранения (правее Экземпляра)
  {
    id: 'ent_storage',
    label: 'Место_Хранения',
    x: 2050,
    y: 850,
    width: 190,
    attrs: [
      { id: 'attr_stor_code', label: 'код_места', isKey: true },
      { id: 'attr_stor_dept', label: 'отдел' },
      { id: 'attr_stor_hall', label: 'номер_зала' },
      { id: 'attr_stor_rack', label: 'номер_стеллажа' },
      { id: 'attr_stor_shelf', label: 'номер_полки' }
    ]
  },
  // Читатель (центр, в блоке обслуживания между Выдачей и Заменой)
  {
    id: 'ent_reader',
    label: 'Читатель',
    x: 770,
    y: 950,
    width: 190,
    attrs: [
      { id: 'attr_read_ticket', label: 'номер_читательского_билета', isKey: true },
      {
        id: 'attr_read_fio',
        label: 'фио',
        subAttributes: [
          { id: 'attr_read_last', label: 'фамилия' },
          { id: 'attr_read_first', label: 'имя' },
          { id: 'attr_read_mid', label: 'отчество' }
        ]
      },
      { id: 'attr_read_birth', label: 'дата_рождения' },
      { id: 'attr_read_age', label: 'возраст', isDerived: true },
      {
        id: 'attr_read_passport',
        label: 'паспорт',
        subAttributes: [
          { id: 'attr_read_pass_s', label: 'серия' },
          { id: 'attr_read_pass_n', label: 'номер' }
        ]
      },
      {
        id: 'attr_read_reg_addr',
        label: 'адрес_регистрации',
        subAttributes: [
          { id: 'attr_read_reg_c', label: 'город_рег' },
          { id: 'attr_read_reg_s', label: 'улица_рег' },
          { id: 'attr_read_reg_h', label: 'дом_рег' },
          { id: 'attr_read_reg_a', label: 'квартира_рег' }
        ]
      },
      {
        id: 'attr_read_fact_addr',
        label: 'адрес_фактический',
        subAttributes: [
          { id: 'attr_read_fact_c', label: 'город_факт' },
          { id: 'attr_read_fact_s', label: 'улица_факт' },
          { id: 'attr_read_fact_h', label: 'дом_факт' },
          { id: 'attr_read_fact_a', label: 'квартира_факт' }
        ]
      },
      { id: 'attr_read_phones', label: 'телефоны', isMultivalued: true },
      { id: 'attr_read_email', label: 'электронная_почта' },
      { id: 'attr_read_cat', label: 'категория' },
      { id: 'attr_read_job', label: 'место_работы_или_учебы' },
      { id: 'attr_read_limit', label: 'лимит_книг' },
      { id: 'attr_read_reg_date', label: 'дата_регистрации' },
      { id: 'attr_read_status', label: 'статус_читателя' }
    ]
  },
  // Акт о замене (центр, уровень 5)
  {
    id: 'ent_replacement',
    label: 'Акт_О_Замене',
    x: 770,
    y: 1220,
    width: 190,
    attrs: [
      { id: 'attr_rep_num', label: 'номер_акта', isKey: true },
      { id: 'attr_rep_date', label: 'дата_акта' },
      { id: 'attr_rep_book', label: 'номер_в_тетради_замен' },
      { id: 'attr_rep_reason', label: 'причина' }
    ]
  },
  // Служебная записка розыск (центр, уровень 6)
  {
    id: 'ent_memo',
    label: 'Служебная_Записка_Розыск',
    x: 760,
    y: 1520,
    width: 230,
    attrs: [
      { id: 'attr_memo_num', label: 'номер_записки', isKey: true },
      { id: 'attr_memo_date', label: 'дата_записки' },
      { id: 'attr_memo_reason', label: 'причина_розыска' },
      {
        id: 'attr_memo_place',
        label: 'предполагаемое_место',
        subAttributes: [
          { id: 'attr_memo_hall', label: 'зал' },
          { id: 'attr_memo_rack', label: 'стеллаж' },
          { id: 'attr_memo_shelf', label: 'полка' }
        ]
      },
      { id: 'attr_memo_status', label: 'статус_поиска' },
      { id: 'attr_memo_end', label: 'дата_завершения_поиска' }
    ]
  },
  // Акт о списании (центр, уровень 7)
  {
    id: 'ent_writeoff',
    label: 'Акт_О_Списании',
    x: 770,
    y: 1820,
    width: 190,
    attrs: [
      { id: 'attr_wroff_num', label: 'номер_акта', isKey: true },
      { id: 'attr_wroff_date', label: 'дата_акта' },
      { id: 'attr_wroff_reason', label: 'причина_списания' },
      { id: 'attr_wroff_sum', label: 'общая_сумма_списания' }
    ]
  }
];

// 3. Создаем узлы сущностей на главном холсте с вложенными subDiagram
const nodes = [];
ENTITY_SPECS.forEach(spec => {
  const subDiag = createSubDiagramForEntity(spec.id, spec.label, spec.attrs);
  nodes.push({
    id: spec.id,
    label: spec.label,
    shape: 'entity',
    x: spec.x,
    y: spec.y,
    width: spec.width || 190,
    height: 65,
    style: {},
    subDiagram: subDiag
  });
});

// 4. Описание всех 18 связей с явным указанием направления процесса и стрелок
// edgeType:
// 'incoming': сущность -> ромб (стрелка направлена в ромб)
// 'outgoing': ромб -> сущность (стрелка направлена в сущность)
// 'bidirectional': двунаправленный обмен (<--> стрелки в обе стороны)
const RELATIONSHIPS = [
  // 1. Поставляет (Поставщик 1 -> Поставляет -> Накладная N!)
  {
    id: 'rel_supplies',
    label: 'Поставляет',
    x: 430,
    y: 147,
    connections: [
      { entity: 'ent_supplier', card: '1', dir: 'incoming' },
      { entity: 'ent_invoice', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 2. Содержимое_Накладной (Накладная M -> Содержимое_Накладной -> Издание N)
  {
    id: 'rel_inv_content',
    label: 'Содержимое_Накладной',
    x: 1140,
    y: 147,
    connections: [
      { entity: 'ent_invoice', card: 'M', dir: 'incoming' },
      { entity: 'ent_edition', card: 'N', dir: 'outgoing' }
    ],
    explicitAttributes: [
      { id: 'attr_ic_line', label: 'номер_строки', x: 970, y: 55 },
      { id: 'attr_ic_qty', label: 'количество', x: 1100, y: 55 },
      { id: 'attr_ic_price', label: 'цена_за_единицу', x: 1230, y: 55 },
      { id: 'attr_ic_sum', label: 'сумма_по_строке', x: 1370, y: 55 }
    ]
  },
  // 3. Принимает_Накладную (Сотрудник 1 -> Принимает_Накладную -> Накладная N!)
  {
    id: 'rel_accept_inv',
    label: 'Принимает_Накладную',
    x: 430,
    y: 300,
    connections: [
      { entity: 'ent_employee', card: '1', dir: 'incoming' },
      { entity: 'ent_invoice', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 4. Фиксирует_Расхождения (Накладная 1 -> Фиксирует_Расхождения -> Акт_О_Расхождениях N!)
  {
    id: 'rel_fix_disc',
    label: 'Фиксирует_Расхождения',
    x: 785,
    y: 285,
    connections: [
      { entity: 'ent_invoice', card: '1', dir: 'incoming' },
      { entity: 'ent_discrepancy', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 5. Составляет_Акт_Расхождений (Сотрудник 1 -> Составляет_Акт_Расхождений -> Акт_О_Расхождениях N!)
  {
    id: 'rel_make_disc',
    label: 'Составляет_Акт_Расхождений',
    x: 430,
    y: 480,
    connections: [
      { entity: 'ent_employee', card: '1', dir: 'incoming' },
      { entity: 'ent_discrepancy', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 6. Относится_К_Изданию (Акт_О_Расхождениях N -> Относится_К_Изданию -> Издание 1!)
  {
    id: 'rel_relates_ed',
    label: 'Относится_К_Изданию',
    x: 1140,
    y: 300,
    connections: [
      { entity: 'ent_discrepancy', card: 'N', dir: 'incoming' },
      { entity: 'ent_edition', card: '1', dir: 'outgoing', isDouble: true }
    ]
  },
  // 7. Воплощает (Издание 1 -> Воплощает -> Экземпляр N!)
  {
    id: 'rel_embodies',
    label: 'Воплощает',
    x: 1515,
    y: 480,
    connections: [
      { entity: 'ent_edition', card: '1', dir: 'incoming' },
      { entity: 'ent_copy', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 8. Оприходован_По (Накладная 1 -> Оприходован_По -> Экземпляр N!)
  {
    id: 'rel_posted_by',
    label: 'Оприходован_По',
    x: 1140,
    y: 520,
    connections: [
      { entity: 'ent_invoice', card: '1', dir: 'incoming' },
      { entity: 'ent_copy', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 9. Хранится_В (Экземпляр N -> Хранится_В -> Место_Хранения 1!)
  {
    id: 'rel_stored_in',
    label: 'Хранится_В',
    x: 1770,
    y: 847,
    connections: [
      { entity: 'ent_copy', card: 'N', dir: 'incoming' },
      { entity: 'ent_storage', card: '1', dir: 'outgoing', isDouble: true }
    ]
  },
  // 10. Выдача (Двунаправленное движение: выдача и возврат книг)
  {
    id: 'rel_loan',
    label: 'Выдача',
    x: 785,
    y: 740,
    connections: [
      { entity: 'ent_employee', card: '1', dir: 'incoming' },
      { entity: 'ent_reader', card: 'M', dir: 'bidirectional' },
      { entity: 'ent_copy', card: 'N', dir: 'bidirectional' }
    ],
    explicitAttributes: [
      { id: 'attr_l_date', label: 'дата_выдачи', x: 630, y: 585 },
      { id: 'attr_l_due', label: 'срок_возврата', x: 770, y: 585 },
      { id: 'attr_l_fact', label: 'факт_дата_возврата', x: 910, y: 585 },
      { id: 'attr_l_cond', label: 'состояние_книги', x: 1050, y: 585 },
      { id: 'attr_l_rsign', label: 'подпись_читателя', x: 630, y: 650 },
      { id: 'attr_l_sstamp', label: 'штамп_библиотекаря', x: 770, y: 650 },
      { id: 'attr_l_ext', label: 'кол_во_продлений', x: 910, y: 650 },
      { id: 'attr_l_ndue', label: 'новый_срок_возврата', x: 1050, y: 650 }
    ]
  },
  // 11. Возмещает_Утерю (Читатель 1 -> Возмещает_Утерю -> Акт_О_Замене N!)
  {
    id: 'rel_compensate',
    label: 'Возмещает_Утерю',
    x: 785,
    y: 1085,
    connections: [
      { entity: 'ent_reader', card: '1', dir: 'incoming' },
      { entity: 'ent_replacement', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 12. Оформляет_Замену (Сотрудник 1 -> Оформляет_Замену -> Акт_О_Замене N!)
  {
    id: 'rel_make_rep',
    label: 'Оформляет_Замену',
    x: 430,
    y: 1217,
    connections: [
      { entity: 'ent_employee', card: '1', dir: 'incoming' },
      { entity: 'ent_replacement', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 13. Заменяет_Утерянный (Акт_О_Замене 1 -> Заменяет_Утерянный -> Экземпляр 1!)
  {
    id: 'rel_rep_lost',
    label: 'Заменяет_Утерянный',
    x: 1140,
    y: 1160,
    connections: [
      { entity: 'ent_replacement', card: '1', dir: 'incoming' },
      { entity: 'ent_copy', card: '1', dir: 'outgoing', isDouble: true }
    ]
  },
  // 14. Принимает_Взамен (Акт_О_Замене 1 <-> Принимает_Взамен <-> Экземпляр 1! - двусторонний обмен)
  {
    id: 'rel_accept_rep',
    label: 'Принимает_Взамен',
    x: 1140,
    y: 1270,
    connections: [
      { entity: 'ent_replacement', card: '1', dir: 'incoming' },
      { entity: 'ent_copy', card: '1', dir: 'bidirectional', isDouble: true }
    ]
  },
  // 15. Подает_Записку_Розыска (Сотрудник 1 -> Подает_Записку_Розыска -> Служебная_Записка_Розыск N!)
  {
    id: 'rel_file_memo',
    label: 'Подает_Записку_Розыска',
    x: 430,
    y: 1517,
    connections: [
      { entity: 'ent_employee', card: '1', dir: 'incoming' },
      { entity: 'ent_memo', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 16. Разыскивает (Служебная_Записка_Розыск N <-> Разыскивает <-> Экземпляр 1! - розыск и возврат в фонд)
  {
    id: 'rel_searches',
    label: 'Разыскивает',
    x: 1140,
    y: 1517,
    connections: [
      { entity: 'ent_memo', card: 'N', dir: 'incoming' },
      { entity: 'ent_copy', card: '1', dir: 'bidirectional', isDouble: true }
    ]
  },
  // 17. Утверждает_Списание (Сотрудник 1 -> Утверждает_Списание -> Акт_О_Списании N!)
  {
    id: 'rel_appr_wroff',
    label: 'Утверждает_Списание',
    x: 430,
    y: 1817,
    connections: [
      { entity: 'ent_employee', card: '1', dir: 'incoming' },
      { entity: 'ent_writeoff', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  },
  // 18. Списывает (Акт_О_Списании 1 -> Списывает -> Экземпляр N!)
  {
    id: 'rel_wroff_copy',
    label: 'Списывает',
    x: 1140,
    y: 1817,
    connections: [
      { entity: 'ent_writeoff', card: '1', dir: 'incoming' },
      { entity: 'ent_copy', card: 'N', dir: 'outgoing', isDouble: true }
    ]
  }
];

// 5. Создаем узлы связей, атрибутов и ребра с правильной направленностью
const edges = [];

RELATIONSHIPS.forEach(rel => {
  nodes.push({
    id: rel.id,
    label: rel.label,
    shape: 'relationship',
    x: rel.x,
    y: rel.y,
    width: 160,
    height: 70,
    style: {}
  });

  rel.connections.forEach(conn => {
    let sourceId, targetId;
    let arrowStart = false;
    let arrowEnd = true;

    if (conn.dir === 'incoming') {
      // От сущности в ромб связи
      sourceId = conn.entity;
      targetId = rel.id;
    } else if (conn.dir === 'bidirectional') {
      // Двунаправленная связь (стрелки в обе стороны)
      sourceId = rel.id;
      targetId = conn.entity;
      arrowStart = true;
      arrowEnd = true;
    } else {
      // От ромба в сущность
      sourceId = rel.id;
      targetId = conn.entity;
    }

    edges.push({
      id: `edge_${sourceId}_${targetId}`,
      source: sourceId,
      target: targetId,
      style: {
        cardinality: conn.card,
        isDouble: !!conn.isDouble,
        routing: 'straight',
        arrowStart,
        arrowEnd
      }
    });
  });

  // Атрибуты самой связи (ненаправленные ребра, без стрелок)
  if (rel.explicitAttributes && rel.explicitAttributes.length > 0) {
    rel.explicitAttributes.forEach(attr => {
      nodes.push({
        id: attr.id,
        label: attr.label,
        shape: 'attribute',
        x: attr.x,
        y: attr.y,
        width: 120,
        height: 42,
        style: {}
      });

      edges.push({
        id: `edge_${rel.id}_${attr.id}`,
        source: rel.id,
        target: attr.id,
        style: {
          routing: 'straight',
          arrowEnd: false
        }
      });
    });
  }
});

// 6. Формируем диаграмму
const diagram = {
  id: diagramId,
  title: 'Библиотечная система (Нотация Чена)',
  mode: 'chen',
  nodes,
  edges,
  groups: [],
  viewport: { x: 50, y: 50, zoom: 0.85 }
};

// 7. Сохраняем на диск и через REST API
fs.writeFileSync(targetFile, JSON.stringify(diagram, null, 2), 'utf-8');
console.log(`Saved to disk: ${targetFile}`);

try {
  const resp = await fetch(`http://localhost:3344/api/diagrams/${diagramId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagram)
  });
  if (resp.ok) {
    console.log('Successfully updated in-memory store via REST API!');
  } else {
    console.error(`Failed to update REST API: ${resp.status}`);
  }
} catch (e) {
  console.log(`Could not connect to running server via HTTP: ${e.message}`);
}

console.log(`Successfully generated Chen Diagram! Nodes: ${nodes.length}, Edges: ${edges.length}`);

/**
 * Tamil Translation Engine for Restaurant Menu & Thermal Receipts
 * Ensures all food item names on thermal receipts and receipt previews 
 * render in Tamil script while reports and back-office remain in English.
 */
import { DEFAULT_FALLBACK_MENU_ITEMS } from '../data/fallbackMenu';

export const TAMIL_MENU_DICTIONARY: Record<string, string> = {
  'rice': 'சாதம்',
  'juice': 'ஜூஸ்',
  // --- Tiffin & Breakfast ---
  'idly': 'இட்லி',
  'idli': 'இட்லி',
  'idly (2 pcs)': 'இட்லி (2)',
  'idli (2 pcs)': 'இட்லி (2)',
  'idly (2)': 'இட்லி (2)',
  'idli (2)': 'இட்லி (2)',
  'sambar idly': 'சாம்பார் இட்லி',
  'sambar idli': 'சாம்பார் இட்லி',
  'ghee podi idly': 'நெய் பொடி இட்லி',
  'ghee podi idli': 'நெய் பொடி இட்லி',
  'podi idly': 'பொடி இட்லி',
  'podi idli': 'பொடி இட்லி',
  'mini idly': 'மினி இட்லி',
  'mini idli': 'மினி இட்லி',
  'sambar mini idly': 'சாம்பார் மினி இட்லி',
  'fried idly': 'ஃப்ரைட் இட்லி',
  'rava idly': 'ரவா இட்லி',
  'rava idli': 'ரவா இட்லி',

  // --- Vada ---
  'vada': 'வடை',
  'medu vada': 'மெது வடை',
  'medu vada (1 pc)': 'மெது வடை (1)',
  'medu vada (1)': 'மெது வடை (1)',
  'sambar vada': 'சாம்பார் வடை',
  'sambar vadai': 'சாம்பார் வடை',
  'curd vada': 'தயிர் வடை',
  'curd vadai': 'தயிர் வடை',
  'thayir vadai': 'தயிர் வடை',
  'rasam vada': 'ரசம் வடை',
  'masala vada': 'மசால் வடை',
  'keerai vada': 'கீரை வடை',

  // --- Dosa Variations ---
  'dosa': 'தோசை',
  'dosai': 'தோசை',
  'plain dosa': 'சாதா தோசை',
  'plain dosai': 'சாதா தோசை',
  'masala dosa': 'மசால் தோசை',
  'masala dosai': 'மசால் தோசை',
  'ghee roast': 'நெய் ரோஸ்ட்',
  'ghee dosa': 'நெய் தோசை',
  'ghee roast dosa': 'நெய் ரோஸ்ட் தோசை',
  'ghee masala dosa': 'நெய் மசால் தோசை',
  'ghee podi dosa': 'நெய் பொடி தோசை',
  'podi dosa': 'பொடி தோசை',
  'onion dosa': 'வெங்காய தோசை',
  'onion roast': 'வெங்காய ரோஸ்ட்',
  'onion rava dosa': 'வெங்காய ரவா தோசை',
  'rava dosa': 'ரவா தோசை',
  'rava masala dosa': 'ரவா மசால் தோசை',
  'egg dosa': 'முட்டை தோசை',
  'egg dosai': 'முட்டை தோசை',
  'egg masala dosa': 'முட்டை மசால் தோசை',
  'kal dosa': 'கல் தோசை',
  'kal dosai': 'கல் தோசை',
  'kal dosa (2 pcs)': 'கல் தோசை (2)',
  'set dosa': 'செட் தோசை',
  'set dosai': 'செட் தோசை',
  'butter dosa': 'பட்டர் தோசை',
  'cheese dosa': 'சீஸ் தோசை',
  'paneer dosa': 'பன்னீர் தோசை',
  'mushroom dosa': 'காளான் தோசை',
  'chicken dosa': 'சிக்கன் தோசை',
  'mutton dosa': 'மட்டன் தோசை',
  'kari dosa': 'கறி தோசை',
  'paper roast': 'பேப்பர் ரோஸ்ட்',
  'special dosa': 'ஸ்பெஷல் தோசை',

  // --- Uthappam ---
  'uthappam': 'ஊத்தப்பம்',
  'oothappam': 'ஊத்தப்பம்',
  'plain uthappam': 'சாதா ஊத்தப்பம்',
  'onion uthappam': 'வெங்காய ஊத்தப்பம்',
  'tomato uthappam': 'தக்காளி ஊத்தப்பம்',
  'podi uthappam': 'பொடி ஊத்தப்பம்',
  'egg uthappam': 'முட்டை ஊத்தப்பம்',
  'mixed veg uthappam': 'வெஜ் ஊத்தப்பம்',

  // --- Poori, Pongal, Upma, Chappathi, Parotta ---
  'poori': 'பூரி',
  'puri': 'பூரி',
  'poori bhaji': 'பூரி பாஜி',
  'poori bhaji (2 pcs)': 'பூரி பாஜி (2)',
  'poori masala': 'பூரி மசால்',
  'poori masala (2 pcs)': 'பூரி மசால் (2)',
  'chola poori': 'சோலா பூரி',
  'pongal': 'பொங்கல்',
  'ven pongal': 'வெண் பொங்கல்',
  'ghee pongal': 'நெய் பொங்கல்',
  'rava upma': 'ரவா உப்புமா',
  'upma': 'உப்புமா',
  'kichadi': 'கிச்சடி',
  'rava kichadi': 'ரவா கிச்சடி',
  'chapati': 'சப்பாத்தி',
  'chapathi': 'சப்பாத்தி',
  'chapati (2 pcs)': 'சப்பாத்தி (2)',
  'chapathi (2 pcs)': 'சப்பாத்தி (2)',
  'butter chapati': 'பட்டர் சப்பாத்தி',
  'parotta': 'பரோட்டா',
  'parotta (2 pcs)': 'பரோட்டா (2)',
  'parotta (2)': 'பரோட்டா (2)',
  'bun parotta': 'பன் பரோட்டா',
  'kothu parotta': 'கொத்து பரோட்டா',
  'veg kothu parotta': 'வெஜ் கொத்து பரோட்டா',
  'egg kothu parotta': 'முட்டை கொத்து பரோட்டா',
  'chicken kothu parotta': 'சிக்கன் கொத்து பரோட்டா',
  'mutton kothu parotta': 'மட்டன் கொத்து பரோட்டா',
  'chilli parotta': 'சில்லி பரோட்டா',
  'ceylon parotta': 'சிலோன் பரோட்டா',
  'appam': 'ஆப்பம்',
  'egg appam': 'முட்டை ஆப்பம்',
  'idiyappam': 'இடியாப்பம்',
  'idiyappam (3 pcs)': 'இடியாப்பம் (3)',
  'puttu': 'புட்டு',

  // --- Meals & Rice Varieties ---
  'meals': 'சாப்பாடு',
  'south indian meals': 'தென்னிந்திய சாப்பாடு',
  'south indian special meals': 'ஸ்பெஷல் சாப்பாடு',
  'special meals': 'ஸ்பெஷல் சாப்பாடு',
  'full meals': 'முழு சாப்பாடு',
  'veg meals': 'வெஜ் சாப்பாடு',
  'non veg meals': 'அசைவ சாப்பாடு',
  'mini meals': 'மினி சாப்பாடு',
  'curd rice': 'தயிர் சாதம்',
  'sambar rice': 'சாம்பார் சாதம்',
  'sambar rice with ghee': 'நெய் சாம்பார் சாதம்',
  'lemon rice': 'எலுமிச்சை சாதம்',
  'tomato rice': 'தக்காளி சாதம்',
  'tamarind rice': 'புளியோதரை',
  'puliyodharai': 'புளியோதரை',
  'coconut rice': 'தேங்காய் சாதம்',
  'ghee rice': 'நெய் சாதம்',
  'jeera rice': 'சீரக சாதம்',
  'garlic rice': 'பூண்டு சாதம்',
  'mini tiffin': 'மினி டிபன்',
  'mini tiffin combo': 'மினி டிபன்',
  'variety rice': 'கலவை சாதம்',

  // --- Biryani & Fried Rice & Noodles ---
  'biryani': 'பிரியாணி',
  'veg biryani': 'வெஜ் பிரியாணி',
  'veg dum biryani': 'வெஜ் தம் பிரியாணி',
  'egg biryani': 'முட்டை பிரியாணி',
  'chicken biryani': 'சிக்கன் பிரியாணி',
  'mutton biryani': 'மட்டன் பிரியாணி',
  'prawn biryani': 'இறால் பிரியாணி',
  'fish biryani': 'மீன் பிரியாணி',
  'kuska': 'குஸ்கா',
  'plain biryani': 'ப்ளைன் பிரியாணி',
  'fried rice': 'ஃப்ரைட் ரைஸ்',
  'veg fried rice': 'வெஜ் ஃப்ரைட் ரைஸ்',
  'egg fried rice': 'முட்டை ஃப்ரைட் ரைஸ்',
  'chicken fried rice': 'சிக்கன் ஃப்ரைட் ரைஸ்',
  'schezwan veg fried rice': 'செஷ்வான் வெஜ் ஃப்ரைட் ரைஸ்',
  'schezwan chicken fried rice': 'செஷ்வான் சிக்கன் ஃப்ரைட் ரைஸ்',
  'noodles': 'நூடுல்ஸ்',
  'veg noodles': 'வெஜ் நூடுல்ஸ்',
  'egg noodles': 'முட்டை நூடுல்ஸ்',
  'chicken noodles': 'சிக்கன் நூடுல்ஸ்',

  // --- Beverages & Hot Drinks ---
  'filter coffee': 'ஃபில்டர் காபி',
  'coffee': 'காபி',
  'hot coffee': 'சூடான காபி',
  'tea': 'டீ',
  'hot tea': 'டீ',
  'masala tea': 'மசாலா டீ',
  'ginger tea': 'இஞ்சி டீ',
  'lemon tea': 'எலுமிச்சை டீ',
  'green tea': 'கிரீன் டீ',
  'black tea': 'பிளாக் டீ',
  'black coffee': 'பிளாக் காபி',
  'milk': 'பால்',
  'hot milk': 'சூடான பால்',
  'boost': 'பூஸ்ட்',
  'horlicks': 'ஹார்லிக்ஸ்',
  'badam milk': 'பாதாம் பால்',
  'sukku coffee': 'சுக்கு காபி',
  'fresh lime soda': 'லெமன் சோடா',
  'lime soda': 'லெமன் சோடா',
  'fresh lime juice': 'எலுமிச்சை ஜூஸ்',
  'lemon juice': 'எலுமிச்சை ஜூஸ்',
  'sweet lassi': 'ஸ்வீட் லஸ்ஸி',
  'salt lassi': 'சால்ட் லஸ்ஸி',
  'lassi': 'லஸ்ஸி',
  'buttermilk': 'மோர்',
  'butter milk': 'மோர்',
  'mor': 'மோர்',
  'rose milk': 'ரோஸ் மில்க்',
  'apple juice': 'ஆப்பிள் ஜூஸ்',
  'orange juice': 'ஆரஞ்சு ஜூஸ்',
  'mango juice': 'மாம்பழ ஜூஸ்',
  'watermelon juice': 'தர்பூசணி ஜூஸ்',
  'pineapple juice': 'அன்னாசி ஜூஸ்',
  'water bottle': 'தண்ணீர் பாட்டில்',
  'mineral water': 'தண்ணீர் பாட்டில்',
  'soda': 'சோடா',

  // --- Starters & Curries ---
  'gobi 65': 'கோபி 65',
  'gobi manchurian': 'கோபி மஞ்சூரியன்',
  'chilli gobi': 'சில்லி கோபி',
  'paneer 65': 'பன்னீர் 65',
  'paneer butter masala': 'பன்னீர் பட்டர் மசாலா',
  'paneer tikka': 'பன்னீர் டிக்கா',
  'paneer butter tikka': 'பன்னீர் டிக்கா',
  'kadai paneer': 'கடாய் பன்னீர்',
  'mushroom 65': 'காளான் 65',
  'mushroom manchurian': 'காளான் மஞ்சூரியன்',
  'mushroom gravy': 'காளான் மசாலா',
  'baby corn manchurian': 'பேபி கார்ன் மஞ்சூரியன்',
  'baby corn 65': 'பேபி கார்ன் 65',
  'veg kurma': 'வெஜ் குருமா',
  'veg curry': 'வெஜ் குழம்பு',
  'dal fry': 'தால் ஃப்ரை',
  'dal tadka': 'தால் தட்கா',
  'aloo gobi': 'ஆலூ கோபி',
  'chicken 65': 'சிக்கன் 65',
  'chilli chicken': 'சில்லி சிக்கன்',
  'chicken lollipop': 'சிக்கன் லாலிபாப்',
  'chicken manchurian': 'சிக்கன் மஞ்சூரியன்',
  'chicken fry': 'சிக்கன் வறுவல்',
  'chicken curry': 'சிக்கன் குழம்பு',
  'chicken gravy': 'சிக்கன் கிரேவி',
  'butter chicken': 'பட்டர் சிக்கன்',
  'chettinad chicken': 'செட்டிநாடு சிக்கன்',
  'mutton chukka': 'மட்டன் சுக்கா',
  'mutton fry': 'மட்டன் வறுவல்',
  'mutton curry': 'மட்டன் குழம்பு',
  'fish fry': 'மீன் வறுவல்',
  'fish curry': 'மீன் குழம்பு',
  'prawn fry': 'இறால் வறுவல்',
  'prawn masala': 'இறால் மசாலா',
  'egg omelette': 'ஆம்லெட்',
  'omelette': 'ஆம்லெட்',
  'half boil': 'ஹாஃப் பாயில்',
  'boiled egg': 'அவித்த முட்டை',
  'boiled egg (1 pc)': 'அவித்த முட்டை (1)',
  'egg fry': 'முட்டை வறுவல்',
  'egg podimas': 'முட்டை பொடிமாஸ்',
  'egg curry': 'முட்டை குழம்பு',
  'egg roast': 'முட்டை ரோஸ்ட்',

  // --- Sweets & Desserts ---
  'gulab jamun': 'குலாப் ஜாமுன்',
  'gulab jamun (2 pcs)': 'குலாப் ஜாமுன் (2)',
  'gulab jamun (2)': 'குலாப் ஜாமுன் (2)',
  'rava kesari': 'ரவா கேசரி',
  'kesari': 'கேசரி',
  'pine apple kesari': 'அன்னாசி கேசரி',
  'rasgulla': 'ரசகுல்லா',
  'rasmalai': 'ரசமலாய்',
  'payasam': 'பாயாசம்',
  'semiya payasam': 'சேமியா பாயாசம்',
  'paal payasam': 'பால் பாயாசம்',
  'ice cream': 'ஐஸ்கிரீம்',
  'vanilla ice cream': 'வெண்ணிலா ஐஸ்கிரீம்',
  'chocolate ice cream': 'சாக்லேட் ஐஸ்கிரீம்',
  'sweet': 'இனிப்பு',
  'extra sambar': 'கூடுதல் சாம்பார்',
  'extra chutney': 'கூடுதல் சட்னி',
  'extra curd': 'கூடுதல் தயிர்',
  'papad': 'அப்பளம்',
  'appalam': 'அப்பளம்',
  'pickle': 'ஊறுகாய்'
};

/**
 * Word fragment map for sub-word composition
 */
const WORD_MAP: Record<string, string> = {
  'idly': 'இட்லி',
  'idli': 'இட்லி',
  'vada': 'வடை',
  'vadai': 'வடை',
  'dosa': 'தோசை',
  'dosai': 'தோசை',
  'roast': 'ரோஸ்ட்',
  'plain': 'சாதா',
  'masala': 'மசால்',
  'podi': 'பொடி',
  'ghee': 'நெய்',
  'butter': 'பட்டர்',
  'cheese': 'சீஸ்',
  'onion': 'வெங்காய',
  'tomato': 'தக்காளி',
  'egg': 'முட்டை',
  'chicken': 'சிக்கன்',
  'mutton': 'மட்டன்',
  'fish': 'மீன்',
  'prawn': 'இறால்',
  'paneer': 'பன்னீர்',
  'mushroom': 'காளான்',
  'gobi': 'கோபி',
  'meals': 'சாப்பாடு',
  'rice': 'சாதம்',
  'biryani': 'பிரியாணி',
  'parotta': 'பரோட்டா',
  'chapati': 'சப்பாத்தி',
  'chapathi': 'சப்பாத்தி',
  'poori': 'பூரி',
  'pongal': 'பொங்கல்',
  'upma': 'உப்புமா',
  'coffee': 'காபி',
  'tea': 'டீ',
  'milk': 'பால்',
  'juice': 'ஜூஸ்',
  'soda': 'சோடா',
  'curry': 'குழம்பு',
  'gravy': 'கிரேவி',
  'fry': 'வறுவல்',
  'special': 'ஸ்பெஷல்',
  'mini': 'மினி',
  'combo': 'காம்போ',
  'sweet': 'ஸ்வீட்',
  'kesari': 'கேசரி',
  'jamun': 'ஜாமுன்'
};

/**
 * Clean & normalize string for lookup
 */
function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Translates an English menu item name into Tamil script.
 * If user supplied a custom Tamil name, that custom name is returned immediately.
 * Otherwise, performs dictionary lookup or intelligent token translation.
 */
export function getTamilItemName(itemName: string, customTamilName?: string): string {
  const cleanCustom = customTamilName?.trim() || '';
  const cleanEnglish = (itemName || '').trim();

  // If customTamilName is provided and either contains Tamil characters or differs from the English name, use it
  if (
    cleanCustom.length > 0 &&
    (/[\u0B80-\u0BFF]/.test(cleanCustom) || cleanCustom.toLowerCase() !== cleanEnglish.toLowerCase())
  ) {
    return cleanCustom;
  }

  if (!itemName || typeof itemName !== 'string') {
    return '';
  }

  const raw = itemName.trim();
  const normalized = normalizeName(raw);
  if (!normalized) {
    return '';
  }

  // 0. Check local Menu Management items if available in localStorage
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const storedMenu = localStorage.getItem('pos_local_menu_items');
      if (storedMenu) {
        const parsed = JSON.parse(storedMenu);
        if (Array.isArray(parsed)) {
          const matchedLocal = parsed.find(
            (m: any) =>
              m &&
              ((m.itemName && normalizeName(String(m.itemName)) === normalized) ||
                (m.itemNameEnglish && normalizeName(String(m.itemNameEnglish)) === normalized)) &&
              m.itemNameTamil &&
              /[\u0B80-\u0BFF]/.test(String(m.itemNameTamil))
          );
          if (matchedLocal) {
            return String(matchedLocal.itemNameTamil).trim();
          }
        }
      }
    } catch (_) {}
  }

  // 0b. Check DEFAULT_FALLBACK_MENU_ITEMS catalog
  const matchedFallback = DEFAULT_FALLBACK_MENU_ITEMS.find(
    (m) => normalizeName(m.itemName) === normalized && m.itemNameTamil
  );
  if (matchedFallback && matchedFallback.itemNameTamil) {
    return matchedFallback.itemNameTamil.trim();
  }

  // 1. Direct dictionary match
  if (TAMIL_MENU_DICTIONARY[normalized]) {
    return TAMIL_MENU_DICTIONARY[normalized];
  }

  // 2. Try removing trailing parenthesis e.g. " (2 pcs)", " (1 pc)", " (2)"
  const cleanBase = normalized.replace(/\s*\(\s*\d+\s*(?:pcs|pc)?\s*\)/gi, '').trim();
  const quantityMatch = normalized.match(/\(\s*(\d+)\s*(?:pcs|pc)?\s*\)/i);
  const qtySuffix = quantityMatch ? ` (${quantityMatch[1]})` : '';

  if (TAMIL_MENU_DICTIONARY[cleanBase]) {
    return TAMIL_MENU_DICTIONARY[cleanBase] + qtySuffix;
  }

  // 3. Sub-word token composition
  const words = cleanBase.split(' ');
  const translatedWords: string[] = [];
  let allMatched = true;

  for (const w of words) {
    if (WORD_MAP[w]) {
      translatedWords.push(WORD_MAP[w]);
    } else {
      allMatched = false;
      break;
    }
  }

  if (allMatched && translatedWords.length > 0) {
    return translatedWords.join(' ') + qtySuffix;
  }

  // 4. Fallback: if already contains Tamil unicode characters, return as-is
  const hasTamilUnicode = /[\u0B80-\u0BFF]/.test(raw);
  if (hasTamilUnicode) {
    return raw;
  }

  // 5. Fallback cleanly to the original English name
  return raw;
}

/**
 * Auto-suggest Tamil name while user types an item in Menu Management
 */
export function suggestTamilName(englishName: string): string {
  if (!englishName || !englishName.trim()) return '';
  return getTamilItemName(englishName);
}

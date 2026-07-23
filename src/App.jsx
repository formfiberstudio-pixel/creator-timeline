import { useState, useEffect, useRef } from 'react'; //[cite: 3]

// Relative imports matching your folder structure
import themeTokens from '../tokens.json'; //[cite: 3]

// Notion tag color palette lookup map
const NOTION_COLOR_MAP = { //[cite: 3]
  default: '#787774', //[cite: 3]
  gray: '#9B9A97', //[cite: 3]
  brown: '#64473A', //[cite: 3]
  orange: '#D9730D', //[cite: 3]
  yellow: '#DFAB01', //[cite: 3]
  green: '#0F7B6C', //[cite: 3]
  blue: '#0B6E99', //[cite: 3]
  purple: '#6940A5', //[cite: 3]
  pink: '#AD1A72', //[cite: 3]
  red: '#E03E3E', //[cite: 3]
}; //[cite: 3]

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']; //[cite: 3]
const TIMELINE_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; //[cite: 3]

// -------------------------------------------------------------
// HELPER: HEX COLOR SHADE ADJUSTMENT (WITH CONTRAST SAFEGUARD)
// -------------------------------------------------------------
const adjustHexColor = (hex, percent) => { //[cite: 3]
  if (!hex || !hex.startsWith('#')) return hex; //[cite: 3]
  let num = parseInt(hex.replace('#',''), 16); //[cite: 3]
  let amt = Math.round(2.55 * percent); //[cite: 3]
  let R = (num >> 16) + amt; //[cite: 3]
  let G = (num >> 8 & 0x00FF) + amt; //[cite: 3]
  let B = (num & 0x0000FF) + amt; //[cite: 3]
  return '#' + ( //[cite: 3]
    0x1000000 + //[cite: 3]
    (R < 230 ? (R < 15 ? 15 : R) : 230) * 0x10000 + //[cite: 3]
    (G < 230 ? (G < 15 ? 15 : G) : 230) * 0x100 + //[cite: 3]
    (B < 230 ? (B < 15 ? 15 : B) : 230) //[cite: 3]
  ).toString(16).slice(1); //[cite: 3]
}; //[cite: 3]

// -------------------------------------------------------------
// ONTARIO STATUTORY HOLIDAY CALCULATOR & NAME RETRIEVAL
// -------------------------------------------------------------
const getOntarioStatHolidayName = (dateObj) => { //[cite: 3]
  if (!dateObj) return null; //[cite: 3]
  const year = dateObj.getFullYear(); //[cite: 3]
  const month = dateObj.getMonth(); //[cite: 3]
  const day = dateObj.getDate(); //[cite: 3]
  const dayOfWeek = dateObj.getDay(); //[cite: 3]

  if (month === 0 && day === 1) return "New Year's Day"; //[cite: 3]
  if (month === 6 && day === 1) return "Canada Day"; //[cite: 3]
  if (month === 11 && day === 25) return "Christmas Day"; //[cite: 3]
  if (month === 11 && day === 26) return "Boxing Day"; //[cite: 3]

  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return "Family Day"; //[cite: 3]
  if (month === 4 && dayOfWeek === 1 && day >= 18 && day <= 24) return "Victoria Day"; //[cite: 3]
  if (month === 7 && dayOfWeek === 1 && day <= 7) return "Civic Holiday"; //[cite: 3]
  if (month === 8 && dayOfWeek === 1 && day <= 7) return "Labour Day"; //[cite: 3]
  if (month === 9 && dayOfWeek === 1 && day >= 8 && day <= 14) return "Thanksgiving"; //[cite: 3]

  const a = year % 19; //[cite: 3]
  const b = Math.floor(year / 100); //[cite: 3]
  const c = year % 100; //[cite: 3]
  const d = Math.floor(b / 4); //[cite: 3]
  const e = b % 4; //[cite: 3]
  const f = Math.floor((b + 8) / 25); //[cite: 3]
  const g = Math.floor((b - f + 1) / 3); //[cite: 3]
  const h = (19 * a + b - d - g + 15) % 30; //[cite: 3]
  const i = Math.floor(c / 4); //[cite: 3]
  const k = c % 4; //[cite: 3]
  const l = (32 + 2 * e + 2 * i - h - k) % 7; //[cite: 3]
  const m = Math.floor((a + 11 * h + 22 * l) / 451); //[cite: 3]
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1; //[cite: 3]
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1; //[cite: 3]
  
  const goodFriday = new Date(year, easterMonth, easterDay - 2); //[cite: 3]
  if (month === goodFriday.getMonth() && day === goodFriday.getDate()) return "Good Friday"; //[cite: 3]

  return null; //[cite: 3]
}; //[cite: 3]

function App() { //[cite: 3]
  // -------------------------------------------------------------
  // 1. STATE & INITIALIZATION
  // -------------------------------------------------------------
  const today = new Date(); //[cite: 3]
  const [currentDate, setCurrentDate] = useState(today); //[cite: 3]
  const [viewMode, setViewMode] = useState('year');  //[cite: 3]
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); //[cite: 3]
  const [selectedProjectFilters, setSelectedProjectFilters] = useState([]);  //[cite: 3]
  const [selectedLogModal, setSelectedLogModal] = useState(null);  //[cite: 3]
  
  // Thumbnail overrides state: { 'YYYY-MM-DD': logId }
  const [thumbnailOverrides, setThumbnailOverrides] = useState({}); //[cite: 3]

  const [hoveredProjectTitle, setHoveredProjectTitle] = useState(null); //[cite: 3]
  const [hoveredWeek, setHoveredWeek] = useState(null); //[cite: 3]
  const [collapsedTypes, setCollapsedTypes] = useState({}); //[cite: 3]

  // --- API STATE VARS ---
  const [timelineLogs, setTimelineLogs] = useState([]); //[cite: 3]
  const [isLoading, setIsLoading] = useState(false); //[cite: 3]
  const [fetchError, setFetchError] = useState(null); //[cite: 3]
  const [showSettings, setShowSettings] = useState(false); //[cite: 3]
  const [notionToken, setNotionToken] = useState(''); //[cite: 3]
  const [databaseId, setDatabaseId] = useState(''); //[cite: 3]

  // --- PROJECT GRADIENT SHADE MAP ---
  const [projectColorMap, setProjectColorMap] = useState({}); //[cite: 3]

  // --- RESPONSIVE ROTATION VARS ---
  const [yearOrientationMode, setYearOrientationMode] = useState('auto'); // 'auto', 'landscape', 'portrait' //[cite: 3]
  const [calendarSize, setCalendarSize] = useState({ width: 0, height: 0 }); //[cite: 3]

  const appRef = useRef(null); //[cite: 3]
  const calendarRef = useRef(null); //[cite: 3]
  const modalCarouselRef = useRef(null); //[cite: 3]

  const [isDarkMode, setIsDarkMode] = useState(() =>  //[cite: 3]
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches //[cite: 3]
  ); //[cite: 3]

  // Resize Observer for Calendar Container Dimension Tracking
  useEffect(() => { //[cite: 3]
    if (!calendarRef.current) return; //[cite: 3]
    const observer = new ResizeObserver((entries) => { //[cite: 3]
      for (let entry of entries) { //[cite: 3]
        setCalendarSize({ //[cite: 3]
          width: entry.contentRect.width, //[cite: 3]
          height: entry.contentRect.height, //[cite: 3]
        }); //[cite: 3]
      } //[cite: 3]
    }); //[cite: 3]
    observer.observe(calendarRef.current); //[cite: 3]
    return () => observer.disconnect(); //[cite: 3]
  }, []); //[cite: 3]

  useEffect(() => { //[cite: 3]
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)'); //[cite: 3]
    const handleChange = (e) => setIsDarkMode(e.matches); //[cite: 3]
    mediaQuery.addEventListener('change', handleChange); //[cite: 3]
    return () => mediaQuery.removeEventListener('change', handleChange); //[cite: 3]
  }, []); //[cite: 3]

  const activeYearOrientation = yearOrientationMode === 'auto'  //[cite: 3]
    ? (calendarSize.width >= calendarSize.height ? 'landscape' : 'portrait')  //[cite: 3]
    : yearOrientationMode; //[cite: 3]

  // -------------------------------------------------------------
  // 2. API FETCHING & GRADIENT COLOR MAPPING LOGIC
  // -------------------------------------------------------------
  useEffect(() => { //[cite: 3]
    const savedToken = localStorage.getItem('notionToken'); //[cite: 3]
    const savedDbId = localStorage.getItem('databaseId'); //[cite: 3]
    if (savedToken && savedDbId) { //[cite: 3]
      setNotionToken(savedToken); //[cite: 3]
      setDatabaseId(savedDbId); //[cite: 3]
      fetchLogsFromNotion(savedToken, savedDbId); //[cite: 3]
    } else { //[cite: 3]
      setShowSettings(true); //[cite: 3]
    } //[cite: 3]
  }, []); //[cite: 3]

  const fetchLogsFromNotion = async (token, dbId) => { //[cite: 3]
    setIsLoading(true); //[cite: 3]
    setFetchError(null); //[cite: 3]
    try { //[cite: 3]
      // Detect the user's current local timezone dynamically
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const response = await fetch('/api/get-notion-logs', { //[cite: 3]
        method: 'POST', //[cite: 3]
        headers: { 'Content-Type': 'application/json' }, //[cite: 3]
        body: JSON.stringify({  //[cite: 3]
          notionToken: token,  //[cite: 3]
          databaseId: dbId, //[cite: 3]
          timeZone: userTimeZone // Send the dynamically retrieved timezone to the backend
        }),
      }); //[cite: 3]
      
      const result = await response.json(); //[cite: 3]
      if (result.success) { //[cite: 3]
        setTimelineLogs(result.data); //[cite: 3]
        generateProjectColorMap(result.data); //[cite: 3]
      } else { //[cite: 3]
        setFetchError(result.error || 'Failed to sync with Notion.'); //[cite: 3]
      } //[cite: 3]
    } catch (err) { //[cite: 3]
      setFetchError('Network error occurred while fetching logs.'); //[cite: 3]
    } finally { //[cite: 3]
      setIsLoading(false); //[cite: 3]
    } //[cite: 3]
  }; //[cite: 3]

  const generateProjectColorMap = (logs) => { //[cite: 3]
    if (!Array.isArray(logs)) return; //[cite: 3]
    const typeToProjects = {}; //[cite: 3]
    
    logs.forEach(log => { //[cite: 3]
      const type = log.projectType || 'General'; //[cite: 3]
      const proj = log.Projects || 'Untitled Project'; //[cite: 3]
      if (!typeToProjects[type]) typeToProjects[type] = new Set(); //[cite: 3]
      typeToProjects[type].add(proj); //[cite: 3]
    }); //[cite: 3]

    const newColorMap = {}; //[cite: 3]
    Object.entries(typeToProjects).forEach(([type, projSet]) => { //[cite: 3]
      const projs = Array.from(projSet).sort(); //[cite: 3]
      const total = projs.length; //[cite: 3]
      
      let baseHex = '#3F3F46'; //[cite: 3]
      const sampleLog = logs.find(l => (l.projectType || 'General') === type); //[cite: 3]
      if (sampleLog?.projectTypeColor && NOTION_COLOR_MAP[sampleLog.projectTypeColor]) { //[cite: 3]
        baseHex = NOTION_COLOR_MAP[sampleLog.projectTypeColor]; //[cite: 3]
      } else if (themeTokens?.colour?.dot?.[type]?.$value?.hex) { //[cite: 3]
        baseHex = themeTokens.colour.dot[type].$value.hex; //[cite: 3]
      } //[cite: 3]

      projs.forEach((proj, idx) => { //[cite: 3]
        const percent = total <= 1 ? 0 : -15 + (idx / (total - 1)) * 25; //[cite: 3]
        newColorMap[proj] = adjustHexColor(baseHex, percent); //[cite: 3]
      }); //[cite: 3]
    }); //[cite: 3]

    setProjectColorMap(newColorMap); //[cite: 3]
  }; //[cite: 3]

  const handleSaveSettings = () => { //[cite: 3]
    localStorage.setItem('notionToken', notionToken); //[cite: 3]
    localStorage.setItem('databaseId', databaseId); //[cite: 3]
    setShowSettings(false); //[cite: 3]
    fetchLogsFromNotion(notionToken, databaseId); //[cite: 3]
  }; //[cite: 3]

  // -------------------------------------------------------------
  // 3. STYLING CONTEXTS (FIGMA DESIGN TOKENS)
  // -------------------------------------------------------------
  const gap = themeTokens?.layout?.gridGap?.$value ?? 12; //[cite: 3]
  const cardRadius = themeTokens?.card?.radius?.$value ?? 6; //[cite: 3]

  const year = currentDate.getFullYear(); //[cite: 3]
  const month = currentDate.getMonth(); //[cite: 3]

  const getDotColor = (log) => { //[cite: 3]
    if (!log) return isDarkMode ? '#3F3F46' : '#CBD5E1'; //[cite: 3]
    const projName = log.Projects || 'Untitled Project'; //[cite: 3]
    if (projectColorMap[projName]) { //[cite: 3]
      return projectColorMap[projName]; //[cite: 3]
    } //[cite: 3]
    if (log.projectTypeColor && NOTION_COLOR_MAP[log.projectTypeColor]) { //[cite: 3]
      return NOTION_COLOR_MAP[log.projectTypeColor]; //[cite: 3]
    } //[cite: 3]
    if (log.projectType) { //[cite: 3]
      const tokenHex = themeTokens?.colour?.dot?.[log.projectType]?.$value?.hex; //[cite: 3]
      if (tokenHex) return tokenHex; //[cite: 3]
    } //[cite: 3]
    return '#3F3F46'; //[cite: 3]
  }; //[cite: 3]

  const getDisplayDotColor = (logs, dateObj) => { //[cite: 3]
    if (!logs || logs.length === 0) return isDarkMode ? '#3F3F46' : '#CBD5E1'; //[cite: 3]
    if (hoveredProjectTitle) { //[cite: 3]
      const matchingLog = logs.find(l => (l.Projects || 'Untitled Project') === hoveredProjectTitle); //[cite: 3]
      if (matchingLog) { //[cite: 3]
        return getDotColor(matchingLog); //[cite: 3]
      } //[cite: 3]
    } //[cite: 3]
    const { primaryLog } = getThumbnailLogForDate(dateObj, logs); //[cite: 3]
    return getDotColor(primaryLog); //[cite: 3]
  }; //[cite: 3]

  const isToday = (dateObj) => { //[cite: 3]
    if (!dateObj) return false; //[cite: 3]
    return ( //[cite: 3]
      dateObj.getFullYear() === today.getFullYear() && //[cite: 3]
      dateObj.getMonth() === today.getMonth() && //[cite: 3]
      dateObj.getDate() === today.getDate() //[cite: 3]
    ); //[cite: 3]
  }; //[cite: 3]

  // -------------------------------------------------------------
  // 4. CALENDAR & DATA QUERY FILTERS
  // -------------------------------------------------------------
  const getLogsForDate = (dateObj) => { //[cite: 3]
    if (!dateObj || !Array.isArray(timelineLogs)) return []; //[cite: 3]
    const targetYear = dateObj.getFullYear(); //[cite: 3]
    const targetMonth = dateObj.getMonth() + 1; //[cite: 3]
    const targetDay = dateObj.getDate(); //[cite: 3]

    return timelineLogs.filter((log) => { //[cite: 3]
      if (log.year && log.monthNumber && log.dayNumber !== undefined) { //[cite: 3]
        const matchesDate = ( //[cite: 3]
          Number(log.year) === targetYear && //[cite: 3]
          Number(log.monthNumber) === targetMonth && //[cite: 3]
          Number(log.dayNumber) === targetDay //[cite: 3]
        ); //[cite: 3]
        if (!matchesDate) return false; //[cite: 3]
        if (selectedProjectFilters.length > 0) { //[cite: 3]
          return selectedProjectFilters.includes(log.Projects); //[cite: 3]
        } //[cite: 3]
        return true; //[cite: 3]
      } //[cite: 3]
      return false; //[cite: 3]
    }); //[cite: 3]
  }; //[cite: 3]

  const getThumbnailLogForDate = (dateObj, logs) => { //[cite: 3]
    if (!logs || logs.length === 0) return { primaryLog: null, isHalftoned: false }; //[cite: 3]
    const dateKey = dateObj.toISOString().split('T')[0]; //[cite: 3]

    if (hoveredProjectTitle) { //[cite: 3]
      const matchingProjectLog = logs.find(l => (l.Projects || 'Untitled Project') === hoveredProjectTitle); //[cite: 3]
      if (matchingProjectLog) { //[cite: 3]
        return { primaryLog: matchingProjectLog, isHalftoned: false }; //[cite: 3]
      } else { //[cite: 3]
        const overrideId = thumbnailOverrides[dateKey]; //[cite: 3]
        const primaryLog = overrideId ? logs.find(l => l.id === overrideId) || logs[0] : logs[0]; //[cite: 3]
        return { primaryLog, isHalftoned: true }; //[cite: 3]
      } //[cite: 3]
    } //[cite: 3]

    const overrideId = thumbnailOverrides[dateKey]; //[cite: 3]
    const primaryLog = overrideId ? logs.find(l => l.id === overrideId) || logs[0] : logs[0]; //[cite: 3]
    return { primaryLog, isHalftoned: false }; //[cite: 3]
  }; //[cite: 3]

  const getYearProjects = (targetYear) => { //[cite: 3]
    if (!Array.isArray(timelineLogs)) return []; //[cite: 3]
    const yearLogs = timelineLogs.filter(log => Number(log.year) === targetYear); //[cite: 3]
    
    const projectMap = {}; //[cite: 3]
    yearLogs.forEach(log => { //[cite: 3]
      const projectName = log.Projects || 'Untitled Project'; //[cite: 3]
      const key = projectName + '::' + (log.projectType || 'General'); //[cite: 3]
      const logDate = new Date(Number(log.year), Number(log.monthNumber) - 1, Number(log.dayNumber)); //[cite: 3]
      if (!projectMap[key]) { //[cite: 3]
        projectMap[key] = { //[cite: 3]
          title: projectName, //[cite: 3]
          projectType: log.projectType || 'General', //[cite: 3]
          projectTypeColor: log.projectTypeColor, //[cite: 3]
          startDate: logDate, //[cite: 3]
          imageUrl: log.imageUrl, //[cite: 3]
        }; //[cite: 3]
      } else { //[cite: 3]
        if (logDate < projectMap[key].startDate) { //[cite: 3]
          projectMap[key].startDate = logDate; //[cite: 3]
        } //[cite: 3]
      } //[cite: 3]
    }); //[cite: 3]

    const projects = Object.values(projectMap); //[cite: 3]
    projects.sort((a, b) => { //[cite: 3]
      if (a.projectType !== b.projectType) return a.projectType.localeCompare(b.projectType); //[cite: 3]
      return a.startDate - b.startDate; //[cite: 3]
    }); //[cite: 3]
    return projects; //[cite: 3]
  }; //[cite: 3]

  const groupedProjects = (() => { //[cite: 3]
    const projects = getYearProjects(year); //[cite: 3]
    const grouped = {}; //[cite: 3]
    projects.forEach(proj => { //[cite: 3]
      const type = proj.projectType || 'General'; //[cite: 3]
      if (!grouped[type]) grouped[type] = []; //[cite: 3]
      grouped[type].push(proj); //[cite: 3]
    }); //[cite: 3]
    return grouped; //[cite: 3]
  })(); //[cite: 3]

  const toggleTypeAccordion = (type) => setCollapsedTypes(prev => ({ ...prev, [type]: !prev[type] })); //[cite: 3]
  const handleExpandAllCategories = () => { const s = {}; Object.keys(groupedProjects).forEach(t => { s[t] = false; }); setCollapsedTypes(s); }; //[cite: 3]
  const handleCollapseAllCategories = () => { const s = {}; Object.keys(groupedProjects).forEach(t => { s[t] = true; }); setCollapsedTypes(s); }; //[cite: 3]
  const handleShowAllFilters = () => setSelectedProjectFilters([]); //[cite: 3]
  const toggleProjectFilter = (title) => setSelectedProjectFilters((prev) => prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]); //[cite: 3]

  const handleWeekClick = (mIdx, weekIndex) => { //[cite: 3]
    const firstDayOfMonthObj = new Date(year, mIdx, 1); //[cite: 3]
    const startOffsetColumn = firstDayOfMonthObj.getDay(); //[cite: 3]
    const daysInMonth = new Date(year, mIdx + 1, 0).getDate(); //[cite: 3]

    let targetDay = null; //[cite: 3]
    for (let i = 0; i < 7; i++) { //[cite: 3]
      const colIndex = weekIndex * 7 + i; //[cite: 3]
      const dayNum = colIndex - startOffsetColumn + 1; //[cite: 3]
      if (dayNum > 0 && dayNum <= daysInMonth) { //[cite: 3]
        targetDay = dayNum; //[cite: 3]
        break; //[cite: 3]
      } //[cite: 3]
    } //[cite: 3]

    if (targetDay !== null) { //[cite: 3]
      setCurrentDate(new Date(year, mIdx, targetDay)); //[cite: 3]
      setViewMode('week'); //[cite: 3]
    } //[cite: 3]
  }; //[cite: 3]

  // -------------------------------------------------------------
  // 5. TIMELINE SLOTS SETUP
  // -------------------------------------------------------------
  let slots = []; //[cite: 3]
  let startOfWeek = null; //[cite: 3]
  let endOfWeek = null; //[cite: 3]

  if (viewMode === 'month') { //[cite: 3]
    const firstDayOfMonth = new Date(year, month, 1); //[cite: 3]
    const startDayOffset = firstDayOfMonth.getDay(); //[cite: 3]
    const daysInMonth = new Date(year, month + 1, 0).getDate(); //[cite: 3]
    const totalSlots = Math.ceil((daysInMonth + startDayOffset) / 7) * 7; //[cite: 3]

    for (let i = 0; i < totalSlots; i++) { //[cite: 3]
      const dayNum = i - startDayOffset + 1; //[cite: 3]
      const isValidDay = dayNum > 0 && dayNum <= daysInMonth; //[cite: 3]
      slots.push({ //[cite: 3]
        dateObj: isValidDay ? new Date(year, month, dayNum) : null, //[cite: 3]
        isValid: isValidDay, //[cite: 3]
        dayNum: isValidDay ? dayNum : null, //[cite: 3]
      }); //[cite: 3]
    } //[cite: 3]
  } else if (viewMode === 'week') { //[cite: 3]
    startOfWeek = new Date(currentDate); //[cite: 3]
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); //[cite: 3]
    endOfWeek = new Date(startOfWeek); //[cite: 3]
    endOfWeek.setDate(startOfWeek.getDate() + 6); //[cite: 3]

    for (let i = 0; i < 7; i++) { //[cite: 3]
      const slotDate = new Date(startOfWeek); //[cite: 3]
      slotDate.setDate(startOfWeek.getDate() + i); //[cite: 3]
      slots.push({ //[cite: 3]
        dateObj: slotDate, //[cite: 3]
        isValid: true, //[cite: 3]
        dayNum: slotDate.getDate(), //[cite: 3]
      }); //[cite: 3]
    } //[cite: 3]
  } //[cite: 3]

  const rows = []; //[cite: 3]
  if (viewMode === 'month') { //[cite: 3]
    for (let i = 0; i < slots.length; i += 7) { //[cite: 3]
      rows.push(slots.slice(i, i + 7)); //[cite: 3]
    } //[cite: 3]
  } //[cite: 3]

  const handlePrev = () => { //[cite: 3]
    if (viewMode === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)); //[cite: 3]
    else if (viewMode === 'week') { const d = new Date(currentDate); d.setDate(currentDate.getDate() - 7); setCurrentDate(d); } //[cite: 3]
    else setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1)); //[cite: 3]
  }; //[cite: 3]

  const handleNext = () => { //[cite: 3]
    if (viewMode === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)); //[cite: 3]
    else if (viewMode === 'week') { const d = new Date(currentDate); d.setDate(currentDate.getDate() + 7); setCurrentDate(d); } //[cite: 3]
    else setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1)); //[cite: 3]
  }; //[cite: 3]

  // -------------------------------------------------------------
  // 6. RENDER (FIXED VIEWPORT / FLUID CONTENT)
  // -------------------------------------------------------------
  return ( //[cite: 3]
    <div ref={appRef} className={`w-full h-screen flex flex-col p-4 sm:p-6 overflow-hidden select-none transition-colors duration-300 ${ //[cite: 3]
      isDarkMode ? 'bg-[#191919] text-zinc-100' : 'bg-slate-50 text-slate-900' //[cite: 3]
    }`}> {/*[cite: 3] */}
      
      {/* HEADER */} 
      <header className="shrink-0 mb-5 flex flex-wrap items-center justify-between gap-4"> {/*[cite: 3] */}
        <div> {/*[cite: 3] */}
          {viewMode === 'month' ? ( //[cite: 3]
            <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"> {/*[cite: 3] */}
              <span>{currentDate.toLocaleDateString('en-US', { month: 'long' })}</span> {/*[cite: 3] */}
              <button onClick={() => setViewMode('year')} className="text-rose-500 cursor-pointer hover:underline">{currentDate.getFullYear()}</button> {/*[cite: 3] */}
            </h1> //[cite: 3]
          ) : viewMode === 'week' ? ( //[cite: 3]
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-1.5"> {/*[cite: 3] */}
              <span className="cursor-pointer hover:text-rose-500" onClick={() => setViewMode('month')}> {/*[cite: 3] */}
                {startOfWeek?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {/*[cite: 3] */}
              </span> {/*[cite: 3] */}
              <span>–</span> {/*[cite: 3] */}
              <span>{endOfWeek?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</span> {/*[cite: 3] */}
              <span className="text-rose-500 cursor-pointer" onClick={() => setViewMode('year')}>{endOfWeek?.getFullYear()}</span> {/*[cite: 3] */}
            </h1> //[cite: 3]
          ) : ( //[cite: 3]
            <h1 className="text-2xl font-bold tracking-tight"> {/*[cite: 3] */}
              <span className="text-rose-500">{year}</span> Projects Overview {/*[cite: 3] */}
            </h1> //[cite: 3]
          )} {/*[cite: 3] */}
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Driven by Figma Tokens & Notion Data.</p> {/*[cite: 3] */}
        </div> {/*[cite: 3] */}

        <div className="flex items-center gap-3"> {/*[cite: 3] */}
          <button //[cite: 3]
            onClick={() => setShowSettings(true)} //[cite: 3]
            title="Notion Integration Settings" //[cite: 3]
            className={`px-3 py-1 text-xs font-semibold border rounded-md cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors ${ //[cite: 3]
              isDarkMode  //[cite: 3]
                ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'  //[cite: 3]
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50' //[cite: 3]
            }`} //[cite: 3]
          > {/*[cite: 3] */}
            <span>⚙️</span><span>Settings</span> {/*[cite: 3] */}
          </button> {/*[cite: 3] */}

          <button //[cite: 3]
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} //[cite: 3]
            className={`px-3 py-1 text-xs font-semibold border rounded-md cursor-pointer flex items-center gap-1.5 ${ //[cite: 3]
              isSidebarOpen  //[cite: 3]
                ? (isDarkMode ? 'bg-zinc-700 text-zinc-100 border-zinc-600' : 'bg-zinc-800 text-white border-zinc-700')  //[cite: 3]
                : (isDarkMode ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700' : 'bg-white text-slate-600 border-slate-300 shadow-xs hover:bg-slate-50') //[cite: 3]
            }`} //[cite: 3]
          > {/*[cite: 3] */}
            <span>📁</span><span>{isSidebarOpen ? 'Hide Projects' : 'Projects'}</span> {/*[cite: 3] */}
          </button> {/*[cite: 3] */}

          <button //[cite: 3]
            onClick={() => setCurrentDate(today)} //[cite: 3]
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 border cursor-pointer ${ //[cite: 3]
              isDarkMode  //[cite: 3]
                ? 'bg-rose-950/40 text-rose-400 border-rose-800/60 hover:bg-rose-900/50'  //[cite: 3]
                : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' //[cite: 3]
            }`} //[cite: 3]
          > {/*[cite: 3] */}
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />Today {/*[cite: 3] */}
          </button> {/*[cite: 3] */}

          <div className={`flex items-center p-0.5 rounded-lg border ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-slate-200 border-slate-300'}`}> {/*[cite: 3] */}
            <button onClick={() => setViewMode('year')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${viewMode === 'year' ? (isDarkMode ? 'bg-zinc-900 text-zinc-100 shadow-xs font-bold' : 'bg-white text-slate-900 shadow-xs font-bold') : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500')}`}>Year</button> {/*[cite: 3] */}
            <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${viewMode === 'month' ? (isDarkMode ? 'bg-zinc-900 text-zinc-100 shadow-xs font-bold' : 'bg-white text-slate-900 shadow-xs font-bold') : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500')}`}>Month</button> {/*[cite: 3] */}
            <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${viewMode === 'week' ? (isDarkMode ? 'bg-zinc-900 text-zinc-100 shadow-xs font-bold' : 'bg-white text-slate-900 shadow-xs font-bold') : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500')}`}>Week</button> {/*[cite: 3] */}
          </div> {/*[cite: 3] */}

          <div className="flex items-center gap-1.5"> {/*[cite: 3] */}
            <button onClick={handlePrev} className={`px-3 py-1.5 text-xs font-semibold border rounded-md cursor-pointer transition-colors ${isDarkMode ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}>← Prev</button> {/*[cite: 3] */}
            <button onClick={handleNext} className={`px-3 py-1.5 text-xs font-semibold border rounded-md cursor-pointer transition-colors ${isDarkMode ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}>Next →</button> {/*[cite: 3] */}
          </div> {/*[cite: 3] */}
        </div> {/*[cite: 3] */}
      </header> {/*[cite: 3] */}

      {/* GLOBAL LOADING / ERROR ALERTS */}
      {isLoading && ( //[cite: 3]
        <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-40 backdrop-blur border px-6 py-3 rounded-full shadow-lg flex items-center gap-3 text-sm font-semibold ${isDarkMode ? 'bg-zinc-900/90 border-zinc-700 text-zinc-200' : 'bg-white/90 border-slate-200 text-slate-700'}`}> {/*[cite: 3] */}
          <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> {/*[cite: 3] */}
          Syncing Notion Data... {/*[cite: 3] */}
        </div> //[cite: 3]
      )} {/*[cite: 3] */}
      {fetchError && !isLoading && ( //[cite: 3]
        <div className="mb-4 p-3 shrink-0 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between items-center"> {/*[cite: 3] */}
          <span>⚠️ {fetchError}</span> {/*[cite: 3] */}
          <button onClick={() => fetchLogsFromNotion(notionToken, databaseId)} className="underline font-bold">Retry</button> {/*[cite: 3] */}
        </div> //[cite: 3]
      )} {/*[cite: 3] */}

      {/* MAIN WORKSPACE SPLIT (Fluid height/width) */}
      <div className="flex-1 flex min-h-0 min-w-0 gap-6"> {/*[cite: 3] */}
        
        {/* SIDEBAR */}
        {isSidebarOpen && ( //[cite: 3]
          <aside className={`w-[260px] shrink-0 h-full flex flex-col p-4 rounded-xl border shadow-xs ${isDarkMode ? 'bg-[#191919] border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'}`} style={{ borderRadius: `${cardRadius}px` }}> {/*[cite: 3] */}
            <div className="mb-3 shrink-0"> {/*[cite: 3] */}
              <h2 className={`text-sm font-bold mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>Categories</h2> {/*[cite: 3] */}
              <div className={`flex flex-wrap items-center gap-1.5 pb-2 border-b ${isDarkMode ? 'border-zinc-800' : 'border-slate-100'}`}> {/*[cite: 3] */}
                <button onClick={handleExpandAllCategories} className={`text-[10px] font-bold px-2 py-1 rounded cursor-pointer transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-rose-400 bg-zinc-800 hover:bg-rose-950/40' : 'text-slate-500 hover:text-rose-500 bg-slate-100 hover:bg-rose-50'}`}>Expand All</button> {/*[cite: 3] */}
                <button onClick={handleCollapseAllCategories} className={`text-[10px] font-bold px-2 py-1 rounded cursor-pointer transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-rose-400 bg-zinc-800 hover:bg-rose-950/40' : 'text-slate-500 hover:text-rose-500 bg-slate-100 hover:bg-rose-50'}`}>Collapse All</button> {/*[cite: 3] */}
                <button onClick={handleShowAllFilters} className={`text-[10px] font-bold px-2 py-1 rounded cursor-pointer ml-auto transition-colors ${isDarkMode ? 'text-rose-400 hover:bg-rose-950/50 bg-rose-950/30' : 'text-rose-600 hover:bg-rose-100 bg-rose-50'}`}>Show All</button> {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
            </div> {/*[cite: 3] */}
            
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0"> {/*[cite: 3] */}
              {Object.entries(groupedProjects).map(([type, projs]) => { //[cite: 3]
                const isHidden = collapsedTypes[type] === true; //[cite: 3]
                const baseTypeHex = projs[0]?.projectTypeColor && NOTION_COLOR_MAP[projs[0].projectTypeColor]  //[cite: 3]
                  ? NOTION_COLOR_MAP[projs[0].projectTypeColor]  //[cite: 3]
                  : (themeTokens?.colour?.dot?.[type]?.$value?.hex || '#7c7c7c'); //[cite: 3]
                const categoryBorderColor = adjustHexColor(baseTypeHex, 40); //[cite: 3]

                return ( //[cite: 3]
                  <div key={type} className={`border rounded-md overflow-hidden shrink-0 shadow-2xs ${isDarkMode ? 'bg-[#191919]' : 'bg-white'}`} style={{ borderColor: categoryBorderColor }}> {/*[cite: 3] */}
                    <div onClick={() => toggleTypeAccordion(type)} className={`text-[10px] font-bold uppercase tracking-wider p-2.5 flex items-center justify-between cursor-pointer transition-colors ${isDarkMode ? 'text-zinc-200 hover:bg-zinc-800/60' : 'text-slate-800 hover:bg-slate-50'}`}> {/*[cite: 3] */}
                      <span className="tracking-wide font-black">{type}</span> {/*[cite: 3] */}
                      <span className="text-[9px] font-mono opacity-60">{isHidden ? '▼' : '▲'}</span> {/*[cite: 3] */}
                    </div> {/*[cite: 3] */}
                    {!isHidden && ( //[cite: 3]
                      <div className={`p-2 pt-0 space-y-1.5 border-t ${isDarkMode ? 'bg-[#191919]' : 'bg-white'}`} style={{ borderColor: categoryBorderColor }}> {/*[cite: 3] */}
                        {projs.map((p, i) => { //[cite: 3]
                          const isSelected = selectedProjectFilters.includes(p.title); //[cite: 3]
                          const dynamicFilterActive = selectedProjectFilters.length > 0; //[cite: 3]
                          const isHovered = hoveredProjectTitle === p.title; //[cite: 3]
                          const projectDotHex = projectColorMap[p.title] || baseTypeHex; //[cite: 3]

                          let cardStyles = isDarkMode  //[cite: 3]
                            ? 'border-zinc-700 bg-zinc-800/80 font-medium text-zinc-200 shadow-2xs hover:border-amber-400'  //[cite: 3]
                            : 'border-slate-300 bg-white font-medium text-slate-800 shadow-2xs hover:border-amber-400'; //[cite: 3]
                          
                          if (isHovered) { //[cite: 3]
                            cardStyles = isDarkMode  //[cite: 3]
                              ? 'border-amber-500 bg-amber-950/40 font-bold text-amber-200 shadow-sm ring-1 ring-amber-500/50 scale-[1.02] z-10 relative transition-all duration-200'  //[cite: 3]
                              : 'border-amber-500 bg-amber-50 font-bold text-amber-800 shadow-sm ring-1 ring-amber-500/50 scale-[1.02] z-10 relative transition-all duration-200'; //[cite: 3]
                          } else if (dynamicFilterActive) { //[cite: 3]
                            cardStyles = isSelected  //[cite: 3]
                              ? (isDarkMode ? 'border-amber-400 bg-zinc-800 font-bold text-zinc-100 shadow-xs ring-1 ring-amber-400/20' : 'border-amber-400 font-bold text-slate-900 shadow-xs ring-1 ring-amber-400/20 bg-white') //[cite: 3]
                              : (isDarkMode ? 'border-zinc-800 bg-zinc-900 opacity-30 font-normal text-zinc-500 hover:opacity-60' : 'border-slate-200 opacity-30 font-normal text-slate-400 hover:opacity-60 bg-white'); //[cite: 3]
                          } //[cite: 3]
                          return ( //[cite: 3]
                            <div  //[cite: 3]
                              key={i}  //[cite: 3]
                              onClick={() => toggleProjectFilter(p.title)}  //[cite: 3]
                              onMouseEnter={() => setHoveredProjectTitle(p.title)}  //[cite: 3]
                              onMouseLeave={() => setHoveredProjectTitle(null)}  //[cite: 3]
                              className={`text-xs p-2.5 rounded border transition-all cursor-pointer flex items-center gap-2 ${cardStyles}`} //[cite: 3]
                            > {/*[cite: 3] */}
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20 shadow-2xs" style={{ backgroundColor: projectDotHex }} /> {/*[cite: 3] */}
                              <span className="truncate">{p.title}</span> {/*[cite: 3] */}
                            </div> //[cite: 3]
                          ); //[cite: 3]
                        })} {/*[cite: 3] */}
                      </div> //[cite: 3]
                    )} {/*[cite: 3] */}
                  </div> //[cite: 3]
                ); //[cite: 3]
              })} {/*[cite: 3] */}
            </div> {/*[cite: 3] */}
          </aside> //[cite: 3]
        )} {/*[cite: 3] */}

        {/* CALENDAR CANVAS (Adapts fluidly based on view) */}
        <main ref={calendarRef} className={`flex-1 h-full min-h-0 min-w-0 border rounded-xl shadow-sm p-4 overflow-hidden flex flex-col relative transition-colors ${isDarkMode ? 'bg-[#191919] border-zinc-800 text-zinc-100' : 'bg-white border-gray-200 text-slate-900'}`} style={{ borderRadius: `${cardRadius}px` }}> {/*[cite: 3] */}
          
          {/* A. MONTH VIEW */}
          {viewMode === 'month' && ( //[cite: 3]
            <div className="flex flex-col h-full w-full min-h-0"> {/*[cite: 3] */}
              <div className="flex items-center gap-2 mb-2 shrink-0"> {/*[cite: 3] */}
                <div className="w-5 shrink-0" /> {/*[cite: 3] */}
                <div className="grid w-full flex-1 text-center text-xs font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: `${gap}px` }}> {/*[cite: 3] */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => ( //[cite: 3]
                    <div key={day} className={idx === 0 || idx === 6 ? 'text-rose-500 font-bold' : (isDarkMode ? 'text-zinc-400' : 'text-slate-500')}>{day}</div> //[cite: 3]
                  ))} {/*[cite: 3] */}
                </div> {/*[cite: 3] */}
              </div> {/*[cite: 3] */}

              <div className="flex flex-col flex-1 min-h-0" style={{ gap: `${gap}px` }}> {/*[cite: 3] */}
                {rows.map((rowSlots, rowIndex) => ( //[cite: 3]
                  <div key={rowIndex} className="flex-1 flex items-stretch gap-2 min-h-0"> {/*[cite: 3] */}
                    <button //[cite: 3]
                      onClick={() => { const targetSlot = rowSlots.find(s => s.isValid && s.dateObj) || rowSlots[0]; if (targetSlot && targetSlot.dateObj) { setCurrentDate(targetSlot.dateObj); setViewMode('week'); } }} //[cite: 3]
                      title="Open Weekly View" //[cite: 3]
                      className={`w-5 shrink-0 rounded-md transition-all flex items-center justify-center cursor-pointer group border shadow-2xs ${isDarkMode ? 'bg-zinc-800 hover:bg-rose-600 text-zinc-400 hover:text-white border-zinc-700 hover:border-rose-600' : 'bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-white border-slate-200 hover:border-rose-500'}`} //[cite: 3]
                    > {/*[cite: 3] */}
                      <span className="text-[10px] font-bold group-hover:scale-125 transition-transform">›</span> {/*[cite: 3] */}
                    </button> {/*[cite: 3] */}
                    <div className="grid w-full flex-1 min-w-0 h-full" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: `${gap}px` }}> {/*[cite: 3] */}
                      {rowSlots.map((slot, slotIndex) => { //[cite: 3]
                        if (!slot.isValid) return <div key={slotIndex} className={`h-full w-full opacity-5 ${isDarkMode ? 'bg-zinc-800' : 'bg-slate-200'}`} style={{ borderRadius: `${cardRadius}px` }} />; //[cite: 3]
                        const logs = getLogsForDate(slot.dateObj); //[cite: 3]
                        const hasLog = logs.length > 0; //[cite: 3]
                        const { primaryLog, isHalftoned } = getThumbnailLogForDate(slot.dateObj, logs); //[cite: 3]
                        const displayDotHex = getDisplayDotColor(logs, slot.dateObj); //[cite: 3]
                        const isHoveredProject = hasLog && logs.some(l => (l.Projects || 'Untitled Project') === hoveredProjectTitle); //[cite: 3]

                        return ( //[cite: 3]
                          <div  //[cite: 3]
                            key={slotIndex}  //[cite: 3]
                            onClick={() => slot.dateObj && setSelectedLogModal({ dateObj: slot.dateObj, logs })} //[cite: 3]
                            onMouseEnter={() => { if (hasLog && primaryLog) setHoveredProjectTitle(primaryLog.Projects || 'Untitled Project'); }} //[cite: 3]
                            onMouseLeave={() => setHoveredProjectTitle(null)} //[cite: 3]
                            className={`h-full w-full relative overflow-hidden p-2 border cursor-pointer flex flex-col justify-end transition-all shadow-2xs ${isDarkMode ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-white border-slate-200 hover:shadow-md'} ${isHoveredProject ? 'ring-2 ring-amber-500 shadow-md scale-[1.02] z-20 bg-amber-500/10' : isToday(slot.dateObj) ? 'ring-2 ring-rose-500 ring-offset-1 z-10' : ''}`} //[cite: 3]
                            style={{ borderRadius: `${cardRadius}px` }} //[cite: 3]
                          > {/*[cite: 3] */}
                            {hasLog && primaryLog?.imageUrl && ( //[cite: 3]
                              <img  //[cite: 3]
                                src={primaryLog.imageUrl}  //[cite: 3]
                                className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-200 ${isHalftoned ? 'opacity-40 grayscale-[20%]' : ''}`}  //[cite: 3]
                                alt=""  //[cite: 3]
                              /> //[cite: 3]
                            )} {/*[cite: 3] */}
                            <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold z-10 text-white shadow-2xs border ${hasLog ? 'border-white/80' : (isDarkMode ? 'border-zinc-700 text-zinc-400 bg-zinc-800' : 'border-slate-300 text-slate-500 bg-white')} ${isHoveredProject ? 'ring-2 ring-amber-500' : isToday(slot.dateObj) && !hasLog ? 'bg-rose-500 ring-2 ring-rose-500 text-white' : ''}`} style={{ backgroundColor: hasLog ? displayDotHex : undefined }}>{slot.dayNum}</div> {/*[cite: 3] */}
                            {hasLog && primaryLog && <div className="relative z-10 text-[10px] sm:text-[11px] font-bold text-white bg-black/70 p-1 rounded-xs backdrop-blur-xs line-clamp-2 leading-tight">{primaryLog.title}</div>} {/*[cite: 3] */}
                          </div> //[cite: 3]
                        ); //[cite: 3]
                      })} {/*[cite: 3] */}
                    </div> {/*[cite: 3] */}
                  </div> //[cite: 3]
                ))} {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
            </div> //[cite: 3]
          )} {/*[cite: 3] */}

          {/* B. WEEK VIEW */}
          {viewMode === 'week' && ( //[cite: 3]
            <div className="flex flex-col h-full w-full min-h-0"> {/*[cite: 3] */}
              <div className="grid text-center text-xs font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: `${gap}px` }}> {/*[cite: 3] */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => ( //[cite: 3]
                  <div key={day} className={idx === 0 || idx === 6 ? 'text-rose-500 font-bold' : (isDarkMode ? 'text-zinc-400' : 'text-slate-500')}>{day}</div> //[cite: 3]
                ))} {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
              
              <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: `${gap}px` }}> {/*[cite: 3] */}
                {slots.map((slot, index) => { //[cite: 3]
                  const logs = getLogsForDate(slot.dateObj); //[cite: 3]
                  const hasLog = logs.length > 0; //[cite: 3]
                  const { primaryLog, isHalftoned } = getThumbnailLogForDate(slot.dateObj, logs); //[cite: 3]
                  const displayDotHex = getDisplayDotColor(logs, slot.dateObj); //[cite: 3]
                  const isHoveredProject = hasLog && logs.some(l => (l.Projects || 'Untitled Project') === hoveredProjectTitle); //[cite: 3]

                  return ( //[cite: 3]
                    <div  //[cite: 3]
                      key={index}  //[cite: 3]
                      className={`flex flex-col h-full border shadow-2xs overflow-hidden transition-all ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200'} ${isHoveredProject ? 'ring-2 ring-amber-500 z-20' : isToday(slot.dateObj) ? 'ring-2 ring-rose-500 ring-offset-1 z-10' : ''}`}  //[cite: 3]
                      style={{ borderRadius: `${cardRadius}px` }} //[cite: 3]
                    > {/*[cite: 3] */}
                      <div  //[cite: 3]
                        onClick={() => slot.dateObj && setSelectedLogModal({ dateObj: slot.dateObj, logs })} //[cite: 3]
                        onMouseEnter={() => { if (hasLog && primaryLog) setHoveredProjectTitle(primaryLog.Projects || 'Untitled Project'); }} //[cite: 3]
                        onMouseLeave={() => setHoveredProjectTitle(null)} //[cite: 3]
                        className={`relative h-[120px] shrink-0 overflow-hidden p-3 border-b cursor-pointer flex flex-col justify-end transition-all ${isDarkMode ? 'border-zinc-800' : 'border-slate-100'} ${isHoveredProject ? 'bg-amber-500/10' : ''}`} //[cite: 3]
                      > {/*[cite: 3] */}
                        {hasLog && primaryLog?.imageUrl && ( //[cite: 3]
                          <img  //[cite: 3]
                            src={primaryLog.imageUrl}  //[cite: 3]
                            className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-200 ${isHalftoned ? 'opacity-40 grayscale-[20%]' : ''}`}  //[cite: 3]
                            alt=""  //[cite: 3]
                          /> //[cite: 3]
                        )} {/*[cite: 3] */}
                        <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold z-10 text-white shadow-2xs border ${hasLog ? 'border-white/80' : (isDarkMode ? 'border-zinc-700 text-zinc-400 bg-zinc-800' : 'border-slate-300 text-slate-500 bg-white')} ${isHoveredProject ? 'ring-2 ring-amber-500' : isToday(slot.dateObj) && !hasLog ? 'bg-rose-500 ring-2 ring-rose-500 text-white' : ''}`} style={{ backgroundColor: hasLog ? displayDotHex : undefined }}>{slot.dayNum}</div> {/*[cite: 3] */}
                        {hasLog && primaryLog && <div className="relative z-10 text-[11px] font-bold text-white bg-black/70 p-1 rounded-xs backdrop-blur-xs line-clamp-2 leading-tight">{primaryLog.title}</div>} {/*[cite: 3] */}
                      </div> {/*[cite: 3] */}
                      <div className="p-3 flex-1 overflow-y-auto min-h-0"> {/*[cite: 3] */}
                        {hasLog && primaryLog?.pageContent && <p className={`text-[11px] leading-normal whitespace-pre-wrap ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>{primaryLog.pageContent}</p>} {/*[cite: 3] */}
                      </div> {/*[cite: 3] */}
                    </div> //[cite: 3]
                  ); //[cite: 3]
                })} {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
            </div> //[cite: 3]
          )} {/*[cite: 3] */}

          {/* C. YEAR VIEW (Dynamic Axis Layout) */}
          {viewMode === 'year' && ( //[cite: 3]
            <div className="flex flex-col h-full w-full min-w-0 min-h-0 relative"> {/*[cite: 3] */}
              
              {/* Manual Override UI Toggle */}
              <div className={`absolute top-0 right-0 z-50 flex items-center border shadow-sm rounded-md p-1 text-[10px] font-bold ${isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-slate-200 text-slate-500'}`}> {/*[cite: 3] */}
                <button  //[cite: 3]
                  onClick={() => setYearOrientationMode('auto')} //[cite: 3]
                  className={`px-2 py-1 rounded-sm transition-colors ${yearOrientationMode === 'auto' ? (isDarkMode ? 'bg-rose-950/60 text-rose-400' : 'bg-rose-50 text-rose-600') : (isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-slate-50')}`} //[cite: 3]
                  title="Auto Switch based on container width vs height" //[cite: 3]
                > {/*[cite: 3] */}
                  AUTO {/*[cite: 3] */}
                </button> {/*[cite: 3] */}
                <div className={`w-px h-3 mx-1 ${isDarkMode ? 'bg-zinc-700' : 'bg-slate-200'}`}></div> {/*[cite: 3] */}
                <button  //[cite: 3]
                  onClick={() => setYearOrientationMode('landscape')} //[cite: 3]
                  className={`px-2 py-1 rounded-sm transition-colors ${yearOrientationMode === 'landscape' ? (isDarkMode ? 'bg-zinc-700 text-zinc-100' : 'bg-slate-100 text-slate-800') : (isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-slate-50')}`} //[cite: 3]
                  title="Force Landscape (Months on Y-Axis)" //[cite: 3]
                > {/*[cite: 3] */}
                  ↔ {/*[cite: 3] */}
                </button> {/*[cite: 3] */}
                <button  //[cite: 3]
                  onClick={() => setYearOrientationMode('portrait')} //[cite: 3]
                  className={`px-2 py-1 rounded-sm transition-colors ${yearOrientationMode === 'portrait' ? (isDarkMode ? 'bg-zinc-700 text-zinc-100' : 'bg-slate-100 text-slate-800') : (isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-slate-50')}`} //[cite: 3]
                  title="Force Portrait (Months on X-Axis)" //[cite: 3]
                > {/*[cite: 3] */}
                  ↕ {/*[cite: 3] */}
                </button> {/*[cite: 3] */}
              </div> {/*[cite: 3] */}

              {activeYearOrientation === 'portrait' ? ( //[cite: 3]
                /* --- PORTRAIT LAYOUT (Months on X, Days on Y) --- */
                <div className="flex flex-col h-full w-full min-w-0 min-h-0 mt-8 relative"> {/*[cite: 3] */}
                  <div className={`grid grid-cols-[30px_repeat(12,minmax(0,1fr))] sm:grid-cols-[40px_repeat(12,minmax(0,1fr))] items-center mb-2 border-b pb-2 shrink-0 ${isDarkMode ? 'border-zinc-800' : 'border-slate-100'}`}> {/*[cite: 3] */}
                    <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 text-center">Day</div> {/*[cite: 3] */}
                    {MONTH_NAMES.map((monthLabel, mIdx) => ( //[cite: 3]
                      <div //[cite: 3]
                        key={monthLabel} //[cite: 3]
                        onClick={() => { setCurrentDate(new Date(year, mIdx, 1)); setViewMode('month'); }} //[cite: 3]
                        className={`text-[10px] sm:text-[11px] font-bold text-center tracking-wide py-1 mx-1 rounded border transition-all cursor-pointer ${ //[cite: 3]
                          isDarkMode  //[cite: 3]
                            ? 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:border-rose-500 hover:text-rose-400'  //[cite: 3]
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-rose-400 hover:text-rose-600' //[cite: 3]
                        }`} //[cite: 3]
                      > {/*[cite: 3] */}
                        {monthLabel} {/*[cite: 3] */}
                      </div> //[cite: 3]
                    ))} {/*[cite: 3] */}
                  </div> {/*[cite: 3] */}
                  
                  <div className="flex-1 flex flex-col justify-between min-h-0 min-w-0 relative"> {/*[cite: 3] */}
                    {/* Background vertical connecting lines for portrait months */}
                    <div className="absolute inset-0 grid grid-cols-[30px_repeat(12,minmax(0,1fr))] sm:grid-cols-[40px_repeat(12,minmax(0,1fr))] pointer-events-none z-0"> {/*[cite: 3] */}
                      <div /> {/*[cite: 3] */}
                      {MONTH_NAMES.map((_, mIdx) => ( //[cite: 3]
                        <div key={mIdx} className="relative h-full flex justify-center"> {/*[cite: 3] */}
                          <div className={`absolute top-0 bottom-0 w-[1.5px] ${isDarkMode ? 'bg-zinc-800' : 'bg-slate-200'}`} /> {/*[cite: 3] */}
                        </div> //[cite: 3]
                      ))} {/*[cite: 3] */}
                    </div> {/*[cite: 3] */}

                    {Array.from({ length: 37 }).map((_, rowIndex) => { //[cite: 3]
                      const weekdayStr = TIMELINE_WEEKDAYS[rowIndex % 7]; //[cite: 3]
                      const isWeekendRow = weekdayStr === 'SUN' || weekdayStr === 'SAT'; //[cite: 3]
                      const weekIndex = Math.floor(rowIndex / 7); //[cite: 3]
                      
                      return ( //[cite: 3]
                        <div key={rowIndex} className={`flex-1 grid grid-cols-[30px_repeat(12,minmax(0,1fr))] sm:grid-cols-[40px_repeat(12,minmax(0,1fr))] items-center min-h-0 border-b border-dashed last:border-0 relative z-10 ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-100/50'}`}> {/*[cite: 3] */}
                          <div className="h-full flex items-center justify-center"> {/*[cite: 3] */}
                             <div className={`w-full text-[8px] sm:text-[9px] font-black tracking-tight py-0.5 text-center rounded ${isWeekendRow ? 'text-rose-500 font-bold' : (isDarkMode ? 'text-zinc-500' : 'text-slate-400')}`}> {/*[cite: 3] */}
                               {weekdayStr.slice(0, 2)} {/*[cite: 3] */}
                             </div> {/*[cite: 3] */}
                          </div> {/*[cite: 3] */}

                          {MONTH_NAMES.map((_, mIdx) => { //[cite: 3]
                            const firstDayOfMonthObj = new Date(year, mIdx, 1); //[cite: 3]
                            const startOffsetColumn = firstDayOfMonthObj.getDay(); //[cite: 3]
                            const daysInMonth = new Date(year, mIdx + 1, 0).getDate(); //[cite: 3]
                            const targetDayNum = rowIndex - startOffsetColumn + 1; //[cite: 3]
                            const isValidCalendarDay = targetDayNum > 0 && targetDayNum <= daysInMonth; //[cite: 3]

                            const isHoveredWeekCell = hoveredWeek?.mIdx === mIdx && hoveredWeek?.weekIndex === weekIndex; //[cite: 3]
                            const weekHighlightStyle = isHoveredWeekCell ? (isDarkMode ? `bg-amber-950/40 border-x border-amber-500/40 z-20 ${rowIndex % 7 === 0 ? 'border-t rounded-t-md' : ''} ${rowIndex % 7 === 6 || rowIndex === 36 ? 'border-b rounded-b-md' : ''}` : `bg-amber-100 border-x border-amber-300/80 z-20 ${rowIndex % 7 === 0 ? 'border-t rounded-t-md' : ''} ${rowIndex % 7 === 6 || rowIndex === 36 ? 'border-b rounded-b-md' : ''}`) : ''; //[cite: 3]

                            if (!isValidCalendarDay) { //[cite: 3]
                              return <div key={mIdx} onClick={() => handleWeekClick(mIdx, weekIndex)} onMouseEnter={() => setHoveredWeek({ mIdx, weekIndex })} onMouseLeave={() => setHoveredWeek(null)} className={`h-full w-full flex items-center justify-center transition-colors cursor-pointer ${isHoveredWeekCell ? weekHighlightStyle : ''}`} />; //[cite: 3]
                            } //[cite: 3]

                            const targetDate = new Date(year, mIdx, targetDayNum); //[cite: 3]
                            const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6; //[cite: 3]
                            const isStatHoliday = getOntarioStatHolidayName(targetDate) !== null; //[cite: 3]
                            const logs = getLogsForDate(targetDate); //[cite: 3]
                            const hasLog = logs.length > 0; //[cite: 3]
                            const primaryLog = hasLog ? logs[0] : null; //[cite: 3]
                            const displayDotHex = getDisplayDotColor(logs, targetDate); //[cite: 3]
                            const isHoveredProject = hasLog && logs.some(l => (l.Projects || 'Untitled Project') === hoveredProjectTitle); //[cite: 3]

                            const slotBackground = isHoveredWeekCell ? weekHighlightStyle : ''; //[cite: 3]

                            let dotStyles = isDarkMode ? 'border bg-zinc-900 text-zinc-400 font-normal hover:border-zinc-600 hover:text-zinc-200' : 'border bg-white text-slate-500 font-normal hover:border-slate-400 hover:text-slate-700'; //[cite: 3]
                            if (hasLog) { //[cite: 3]
                              let ringClass = isStatHoliday ? 'ring-2 ring-amber-400/60' : isWeekend ? 'ring-2 ring-rose-400/50' : ''; //[cite: 3]
                              if (isHoveredProject) ringClass = 'ring-2 ring-amber-500 scale-125 z-30'; //[cite: 3]
                              dotStyles = `text-white font-bold border border-white/80 shadow-xs scale-110 ${ringClass}`; //[cite: 3]
                            } else if (isStatHoliday) { //[cite: 3]
                              dotStyles = isDarkMode ? 'border border-amber-600/70 bg-zinc-900 text-amber-400 font-medium hover:border-amber-500' : 'border border-amber-300 bg-white text-amber-600 font-medium hover:border-amber-400 hover:text-amber-700'; //[cite: 3]
                            } else if (isWeekend) { //[cite: 3]
                              dotStyles = isDarkMode ? 'border border-rose-800/70 bg-zinc-900 text-rose-400 font-medium hover:border-rose-700' : 'border border-rose-300 bg-white text-rose-500 font-medium hover:border-rose-400 hover:text-rose-600'; //[cite: 3]
                            } else { //[cite: 3]
                              dotStyles = isDarkMode ? 'border border-zinc-700 bg-zinc-900 text-zinc-400 font-normal hover:border-zinc-500' : 'border border-slate-300 bg-white text-slate-500 font-normal'; //[cite: 3]
                            } //[cite: 3]

                            return ( //[cite: 3]
                              <div key={mIdx} onClick={() => handleWeekClick(mIdx, weekIndex)} onMouseEnter={() => { setHoveredWeek({ mIdx, weekIndex }); if (hasLog && primaryLog) setHoveredProjectTitle(primaryLog.Projects || 'Untitled Project'); }} onMouseLeave={() => { setHoveredWeek(null); setHoveredProjectTitle(null); }} className={`h-full w-full flex items-center justify-center relative cursor-pointer group/node transition-colors ${slotBackground}`}> {/*[cite: 3] */}
                                <div onClick={(e) => { e.stopPropagation(); setSelectedLogModal({ dateObj: targetDate, logs }); }} className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center text-[7px] sm:text-[8px] transition-all relative z-10 ${dotStyles} ${hasLog ? 'border-white/80' : ''} ${isHoveredProject ? 'ring-2 ring-amber-500 ring-offset-1 font-bold z-30 scale-125' : isToday(targetDate) ? 'ring-2 ring-rose-500 ring-offset-1 font-bold' : ''}`} style={{ backgroundColor: hasLog ? displayDotHex : undefined }}>{targetDayNum}</div> {/*[cite: 3] */}
                              </div> //[cite: 3]
                            ); //[cite: 3]
                          })} {/*[cite: 3] */}
                        </div> //[cite: 3]
                      ); //[cite: 3]
                    })} {/*[cite: 3] */}
                  </div> {/*[cite: 3] */}
                </div> //[cite: 3]
              ) : ( //[cite: 3]
                /* --- LANDSCAPE LAYOUT (Days on X, Months on Y) --- */
                <div className="flex flex-col h-full w-full min-w-0 min-h-0 mt-8"> {/*[cite: 3] */}
                  <div className={`grid grid-cols-[50px_1fr] sm:grid-cols-[65px_1fr] items-center mb-2 border-b pb-2 shrink-0 ${isDarkMode ? 'border-zinc-800' : 'border-slate-100'}`}> {/*[cite: 3] */}
                    <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 text-center">Month</div> {/*[cite: 3] */}
                    <div className="grid gap-0.5 sm:gap-1 text-center min-w-0" style={{ gridTemplateColumns: 'repeat(37, minmax(0, 1fr))' }}> {/*[cite: 3] */}
                      {Array.from({ length: 37 }).map((_, colIndex) => { //[cite: 3]
                        const weekdayStr = TIMELINE_WEEKDAYS[colIndex % 7]; //[cite: 3]
                        const isWeekend = weekdayStr === 'SUN' || weekdayStr === 'SAT'; //[cite: 3]
                        return <div key={colIndex} className={`text-[8px] sm:text-[9px] font-black tracking-tight py-1 rounded ${isWeekend ? 'text-rose-500 font-bold' : (isDarkMode ? 'text-zinc-500' : 'text-slate-400')}`}>{weekdayStr.slice(0, 2)}</div>; //[cite: 3]
                      })} {/*[cite: 3] */}
                    </div> {/*[cite: 3] */}
                  </div> {/*[cite: 3] */}
                  
                  <div className="flex-1 flex flex-col justify-between min-h-0 min-w-0"> {/*[cite: 3] */}
                    {MONTH_NAMES.map((monthLabel, mIdx) => { //[cite: 3]
                      const firstDayOfMonthObj = new Date(year, mIdx, 1); //[cite: 3]
                      const startOffsetColumn = firstDayOfMonthObj.getDay();  //[cite: 3]
                      const daysInMonth = new Date(year, mIdx + 1, 0).getDate(); //[cite: 3]
                      return ( //[cite: 3]
                        <div key={monthLabel} className={`grid grid-cols-[50px_1fr] sm:grid-cols-[65px_1fr] items-center h-full min-h-0 min-w-0 relative group border-b border-dashed last:border-0 ${isDarkMode ? 'border-zinc-800/50' : 'border-slate-100/50'}`}> {/*[cite: 3] */}
                          <div onClick={() => { setCurrentDate(new Date(year, mIdx, 1)); setViewMode('month'); }} className={`text-[10px] sm:text-[11px] font-bold text-center tracking-wide py-1 mx-1 rounded border transition-all cursor-pointer ${isDarkMode ? 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:border-rose-500 hover:text-rose-400' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-rose-400 hover:text-rose-600'}`}> {/*[cite: 3] */}
                            {monthLabel} {/*[cite: 3] */}
                          </div> {/*[cite: 3] */}
                          <div className="grid gap-0.5 sm:gap-1 items-center relative h-full min-w-0" style={{ gridTemplateColumns: 'repeat(37, minmax(0, 1fr))' }}> {/*[cite: 3] */}
                            {/* Connecting line behind month dots */}
                            <div className={`absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[1.5px] z-0 pointer-events-none ${isDarkMode ? 'bg-zinc-800' : 'bg-slate-200'}`} /> {/*[cite: 3] */}

                            {Array.from({ length: 37 }).map((_, colIndex) => { //[cite: 3]
                              const weekIndex = Math.floor(colIndex / 7); //[cite: 3]
                              const isHoveredWeekCell = hoveredWeek?.mIdx === mIdx && hoveredWeek?.weekIndex === weekIndex; //[cite: 3]
                              const weekdayStr = TIMELINE_WEEKDAYS[colIndex % 7]; //[cite: 3]
                              const targetDayNum = colIndex - startOffsetColumn + 1; //[cite: 3]
                              const isValidCalendarDay = targetDayNum > 0 && targetDayNum <= daysInMonth; //[cite: 3]
                              const weekRoundClass = colIndex % 7 === 0 ? 'rounded-l-md -ml-0.5' : colIndex % 7 === 6 || colIndex === 36 ? 'rounded-r-md -mr-0.5' : 'rounded-none'; //[cite: 3]
                              const weekHighlightStyle = isHoveredWeekCell ? (isDarkMode ? `bg-amber-950/40 border-y border-amber-500/40 z-20 ${colIndex % 7 === 0 ? 'border-l' : ''} ${colIndex % 7 === 6 || colIndex === 36 ? 'border-r' : ''}` : `bg-amber-100 border-y border-amber-300/80 z-20 ${colIndex % 7 === 0 ? 'border-l' : ''} ${colIndex % 7 === 6 || colIndex === 36 ? 'border-r' : ''}`) : ''; //[cite: 3]

                              if (!isValidCalendarDay) { //[cite: 3]
                                return <div key={colIndex} onClick={() => handleWeekClick(mIdx, weekIndex)} onMouseEnter={() => setHoveredWeek({ mIdx, weekIndex })} onMouseLeave={() => setHoveredWeek(null)} className={`h-full flex items-center justify-center transition-colors cursor-pointer ${weekRoundClass} ${isHoveredWeekCell ? weekHighlightStyle : 'z-10'}`} />; //[cite: 3]
                              } //[cite: 3]
                              
                              const targetDate = new Date(year, mIdx, targetDayNum); //[cite: 3]
                              const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6; //[cite: 3]
                              const isStatHoliday = getOntarioStatHolidayName(targetDate) !== null; //[cite: 3]
                              const logs = getLogsForDate(targetDate); //[cite: 3]
                              const hasLog = logs.length > 0; //[cite: 3]
                              const primaryLog = hasLog ? logs[0] : null; //[cite: 3]
                              const displayDotHex = getDisplayDotColor(logs, targetDate); //[cite: 3]
                              const isHoveredProject = hasLog && logs.some(l => (l.Projects || 'Untitled Project') === hoveredProjectTitle); //[cite: 3]
                              
                              const slotBackground = isHoveredWeekCell ? weekHighlightStyle : ''; //[cite: 3]
                              
                              let dotStyles = isDarkMode ? 'border bg-zinc-900 text-zinc-400 font-normal hover:border-zinc-600 hover:text-zinc-200' : 'border bg-white text-slate-500 font-normal hover:border-slate-400 hover:text-slate-700'; //[cite: 3]
                              if (hasLog) { //[cite: 3]
                                let ringClass = isStatHoliday ? 'ring-2 ring-amber-400/60' : isWeekend ? 'ring-2 ring-rose-400/50' : ''; //[cite: 3]
                                if (isHoveredProject) ringClass = 'ring-2 ring-amber-500 scale-125 z-30'; //[cite: 3]
                                dotStyles = `text-white font-bold border border-white/80 shadow-xs scale-110 ${ringClass}`; //[cite: 3]
                              } else if (isStatHoliday) { //[cite: 3]
                                dotStyles = isDarkMode ? 'border border-amber-600/70 bg-zinc-900 text-amber-400 font-medium hover:border-amber-500' : 'border border-amber-300 bg-white text-amber-600 font-medium hover:border-amber-400 hover:text-amber-700'; //[cite: 3]
                              } else if (isWeekend) { //[cite: 3]
                                dotStyles = isDarkMode ? 'border border-rose-800/70 bg-zinc-900 text-rose-400 font-medium hover:border-rose-700' : 'border border-rose-300 bg-white text-rose-500 font-medium hover:border-rose-400 hover:text-rose-600'; //[cite: 3]
                              } else { //[cite: 3]
                                dotStyles = isDarkMode ? 'border border-zinc-700 bg-zinc-900 text-zinc-400 font-normal hover:border-zinc-500' : 'border border-slate-300 bg-white text-slate-500 font-normal'; //[cite: 3]
                              } //[cite: 3]

                              return ( //[cite: 3]
                                <div key={colIndex} onClick={() => handleWeekClick(mIdx, weekIndex)} onMouseEnter={() => { setHoveredWeek({ mIdx, weekIndex }); if (hasLog && primaryLog) setHoveredProjectTitle(primaryLog.Projects || 'Untitled Project'); }} onMouseLeave={() => { setHoveredWeek(null); setHoveredProjectTitle(null); }} className={`h-full flex items-center justify-center relative cursor-pointer group/node transition-colors ${weekRoundClass} ${slotBackground}`}> {/*[cite: 3] */}
                                  <div onClick={(e) => { e.stopPropagation(); setSelectedLogModal({ dateObj: targetDate, logs }); }} className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center text-[7px] sm:text-[8px] transition-all relative z-10 ${dotStyles} ${hasLog ? 'border-white/80' : ''} ${isHoveredProject ? 'ring-2 ring-amber-500 ring-offset-1 font-bold z-30 scale-125' : isToday(targetDate) ? 'ring-2 ring-rose-500 ring-offset-1 font-bold' : ''}`} style={{ backgroundColor: hasLog ? displayDotHex : undefined }}>{targetDayNum}</div> {/*[cite: 3] */}
                                </div> //[cite: 3]
                              ); //[cite: 3]
                            })} {/*[cite: 3] */}
                          </div> {/*[cite: 3] */}
                        </div> //[cite: 3]
                      ); //[cite: 3]
                    })} {/*[cite: 3] */}
                  </div> {/*[cite: 3] */}
                </div> //[cite: 3]
              )} {/*[cite: 3] */}
            </div> //[cite: 3]
          )} {/*[cite: 3] */}
        </main> {/*[cite: 3] */}
      </div> {/*[cite: 3] */}

      {/* ------------------------------------------------------------- */}
      {/* SETTINGS MODAL */}
      {/* ------------------------------------------------------------- */}
      {showSettings && ( //[cite: 3]
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-xs text-slate-800"> {/*[cite: 3] */}
          <div className={`w-full max-w-md rounded-xl shadow-xl border p-6 ${isDarkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-200 text-slate-800'}`}> {/*[cite: 3] */}
            <h2 className="text-lg font-bold mb-4">Widget Setup</h2> {/*[cite: 3] */}
            <p className={`text-xs mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Enter your Notion Integration Token and Database ID to fetch your personal logs.</p> {/*[cite: 3] */}
            
            <div className="space-y-4"> {/*[cite: 3] */}
              <div> {/*[cite: 3] */}
                <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>Notion Integration Token</label> {/*[cite: 3] */}
                <input  //[cite: 3]
                  type="password"  //[cite: 3]
                  value={notionToken}  //[cite: 3]
                  onChange={(e) => setNotionToken(e.target.value)}  //[cite: 3]
                  className={`w-full border rounded px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-rose-500' : 'border-slate-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'}`} //[cite: 3]
                  placeholder="secret_..." //[cite: 3]
                /> {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
              <div> {/*[cite: 3] */}
                <label className={`block text-xs font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>Notion Database ID</label> {/*[cite: 3] */}
                <input  //[cite: 3]
                  type="text"  //[cite: 3]
                  value={databaseId}  //[cite: 3]
                  onChange={(e) => setDatabaseId(e.target.value)}  //[cite: 3]
                  className={`w-full border rounded px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-rose-500' : 'border-slate-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'}`} //[cite: 3]
                  placeholder="3728d5a5..." //[cite: 3]
                /> {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
            </div> {/*[cite: 3] */}

            <div className="mt-8 flex items-center justify-end gap-3"> {/*[cite: 3] */}
              <button  //[cite: 3]
                onClick={() => setShowSettings(false)}  //[cite: 3]
                className={`px-4 py-2 text-sm font-semibold cursor-pointer ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-800'}`} //[cite: 3]
              > {/*[cite: 3] */}
                Cancel {/*[cite: 3] */}
              </button> {/*[cite: 3] */}
              <button  //[cite: 3]
                onClick={handleSaveSettings}  //[cite: 3]
                disabled={!notionToken || !databaseId} //[cite: 3]
                className="px-4 py-2 text-sm font-bold text-white bg-rose-500 rounded hover:bg-rose-600 disabled:opacity-50 cursor-pointer shadow-xs" //[cite: 3]
              > {/*[cite: 3] */}
                Save & Sync {/*[cite: 3] */}
              </button> {/*[cite: 3] */}
            </div> {/*[cite: 3] */}
          </div> {/*[cite: 3] */}
        </div> //[cite: 3]
      )} {/*[cite: 3] */}

      {/* ------------------------------------------------------------- */}
      {/* DETAIL LOG MODAL (DYNAMIC GRID FRACTIONS & NOTION PVS LINK) */}
      {/* ------------------------------------------------------------- */}
      {selectedLogModal && (() => { //[cite: 3]
        const dateKey = selectedLogModal.dateObj.toISOString().split('T')[0]; //[cite: 3]
        const currentThumbId = thumbnailOverrides[dateKey] || (selectedLogModal.logs[0]?.id); //[cite: 3]
        const logs = selectedLogModal.logs; //[cite: 3]

        const scrollCarousel = (direction) => { //[cite: 3]
          if (!modalCarouselRef.current) return; //[cite: 3]
          const firstChild = modalCarouselRef.current.firstElementChild; //[cite: 3]
          // Scroll accurately by measuring the first card's actual width + 24px gap
          const scrollAmount = firstChild ? firstChild.clientWidth + 24 : 450; //[cite: 3]
          modalCarouselRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' }); //[cite: 3]
        }; //[cite: 3]

        return ( //[cite: 3]
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-8 bg-black/70 backdrop-blur-xs" onClick={() => setSelectedLogModal(null)}> {/*[cite: 3] */}
            <div className={`w-[90%] max-w-[1300px] h-[85%] max-h-[850px] rounded-2xl flex flex-col overflow-hidden shadow-2xl border ${isDarkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'}`} onClick={(e) => e.stopPropagation()}> {/*[cite: 3] */}
              
              {/* Modal Header */}
              <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${isDarkMode ? 'bg-zinc-800/80 border-zinc-700' : 'bg-slate-50 border-slate-100'}`}> {/*[cite: 3] */}
                <div className="flex items-center gap-2 flex-wrap"> {/*[cite: 3] */}
                  <span className="text-sm font-bold text-rose-500 tracking-wider"> {/*[cite: 3] */}
                    {selectedLogModal.dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} {/*[cite: 3] */}
                  </span> {/*[cite: 3] */}
                  {getOntarioStatHolidayName(selectedLogModal.dateObj) && ( //[cite: 3]
                    <span className="text-xs font-bold text-amber-500 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"> {/*[cite: 3] */}
                      <span>—</span> {/*[cite: 3] */}
                      <span>{getOntarioStatHolidayName(selectedLogModal.dateObj)}</span> {/*[cite: 3] */}
                    </span> //[cite: 3]
                  )} {/*[cite: 3] */}
                </div> {/*[cite: 3] */}
                <button onClick={() => setSelectedLogModal(null)} className={`font-bold cursor-pointer text-base ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-400 hover:text-slate-600'}`}>✕</button> {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
              
              {/* Modal Body Carousel Container with Chevron Arrows */}
              <div className="relative flex-1 flex items-center overflow-hidden p-6 sm:p-8"> {/*[cite: 3] */}
                
                {/* Left Chevron Button */}
                {logs.length > 1 && ( //[cite: 3]
                  <button  //[cite: 3]
                    onClick={() => scrollCarousel('left')} //[cite: 3]
                    className={`absolute left-3 z-30 w-10 h-10 rounded-full flex items-center justify-center border shadow-md transition-all cursor-pointer ${ //[cite: 3]
                      isDarkMode  //[cite: 3]
                        ? 'bg-zinc-800/90 border-zinc-700 text-zinc-200 hover:bg-rose-600 hover:border-rose-600 hover:text-white'  //[cite: 3]
                        : 'bg-white/90 border-slate-300 text-slate-700 hover:bg-rose-500 hover:border-rose-500 hover:text-white' //[cite: 3]
                    }`} //[cite: 3]
                    title="Scroll Left" //[cite: 3]
                  > {/*[cite: 3] */}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"> {/*[cite: 3] */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /> {/*[cite: 3] */}
                    </svg> {/*[cite: 3] */}
                  </button> //[cite: 3]
                )} {/*[cite: 3] */}

                {/* Horizontal Scroll Area (Dynamic Math Flex-basis) */}
                <div  //[cite: 3]
                  ref={modalCarouselRef}  //[cite: 3]
                  className="w-full h-full flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory items-stretch select-none" //[cite: 3]
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} //[cite: 3]
                > {/*[cite: 3] */}
                  {logs.length > 0 ? ( //[cite: 3]
                    logs.map((log) => { //[cite: 3]
                      const isThumbnail = log.id === currentThumbId; //[cite: 3]

                      // Deep link mapping logic
                      const httpsUrl = log.url || `https://www.notion.so/${log.id.replace(/-/g, '')}`; //[cite: 3]
                      const desktopUrl = httpsUrl.replace('https://', 'notion://'); //[cite: 3]
                      const notionPageUrl = desktopUrl.includes('?') ? `${desktopUrl}&pvs=4` : `${desktopUrl}?pvs=4`; //[cite: 3]

                      return ( //[cite: 3]
                        <div  //[cite: 3]
                          key={log.id}  //[cite: 3]
                          onClick={() => setThumbnailOverrides(prev => ({ ...prev, [dateKey]: log.id }))} //[cite: 3]
                          // Fluid calc rules: 1 card wide on mobile, 2 cards perfectly on sm screens, 3 cards on lg screens
                          className={`shrink-0 w-full sm:w-[calc((100%-24px)/2)] lg:w-[calc((100%-48px)/3)] snap-start h-full my-auto flex flex-col p-5 sm:p-6 border rounded-xl gap-4 shadow-sm cursor-pointer transition-all ${ //[cite: 3]
                            isThumbnail  //[cite: 3]
                              ? (isDarkMode ? 'border-2 border-amber-500 bg-amber-950/20 ring-2 ring-amber-500/20' : 'border-2 border-amber-500 bg-amber-50/20 ring-2 ring-amber-500/20') //[cite: 3]
                              : (isDarkMode ? 'border-zinc-700 bg-zinc-800/80 hover:border-zinc-500' : 'border-slate-200 bg-slate-50 hover:border-slate-400') //[cite: 3]
                          }`} //[cite: 3]
                        > {/*[cite: 3] */}
                          <div className="flex items-center justify-between"> {/*[cite: 3] */}
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded inline-block" style={{ color: getDotColor(log), borderColor: getDotColor(log) }}>{log.projectType}</span> {/*[cite: 3] */}
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isThumbnail ? 'bg-amber-500 text-white' : (isDarkMode ? 'bg-zinc-700 text-zinc-300' : 'bg-slate-200 text-slate-600')}`}> {/*[cite: 3] */}
                              {isThumbnail ? '★ Current Thumbnail' : 'Click to set as thumbnail'} {/*[cite: 3] */}
                            </span> {/*[cite: 3] */}
                          </div> {/*[cite: 3] */}

                          {log.imageUrl && ( //[cite: 3]
                            <img  //[cite: 3]
                              src={log.imageUrl}  //[cite: 3]
                              className={`h-[210px] w-full rounded-md object-cover border ${isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-100'}`}  //[cite: 3]
                              alt=""  //[cite: 3]
                            /> //[cite: 3]
                          )} {/*[cite: 3] */}

                          <div className="flex items-center justify-between gap-2"> {/*[cite: 3] */}
                            <h3 className={`text-base font-bold truncate ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>{log.title}</h3> {/*[cite: 3] */}
                            <a  //[cite: 3]
                              href={notionPageUrl}  //[cite: 3]
                              target="_blank"  //[cite: 3]
                              rel="noopener noreferrer"  //[cite: 3]
                              onClick={(e) => e.stopPropagation()} //[cite: 3]
                              className={`text-xs font-semibold px-2.5 py-1 rounded border shrink-0 flex items-center gap-1 transition-colors ${ //[cite: 3]
                                isDarkMode  //[cite: 3]
                                  ? 'bg-zinc-800 border-zinc-700 text-rose-400 hover:bg-rose-950/40 hover:border-rose-700'  //[cite: 3]
                                  : 'bg-white border-slate-300 text-rose-600 hover:bg-rose-50 hover:border-rose-300' //[cite: 3]
                              }`} //[cite: 3]
                              title="Open in Notion Center Peek" //[cite: 3]
                            > {/*[cite: 3] */}
                              <span>Open in Notion</span> {/*[cite: 3] */}
                              <span className="text-[10px]">↗</span> {/*[cite: 3] */}
                            </a> {/*[cite: 3] */}
                          </div> {/*[cite: 3] */}

                          {log.pageContent && ( //[cite: 3]
                            <div className={`text-xs p-3 rounded border leading-normal whitespace-pre-wrap flex-1 overflow-hidden ${isDarkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-slate-200 text-slate-600'}`}> {/*[cite: 3] */}
                              <div className="line-clamp-[12] lg:line-clamp-[16] 2xl:line-clamp-[22] text-ellipsis"> {/*[cite: 3] */}
                                {log.pageContent} {/*[cite: 3] */}
                              </div> {/*[cite: 3] */}
                            </div> //[cite: 3]
                          )} {/*[cite: 3] */}
                        </div> //[cite: 3]
                      ); //[cite: 3]
                    }) //[cite: 3]
                  ) : ( //[cite: 3]
                    <div className={`flex items-center justify-center text-center py-12 w-full italic text-sm ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}> {/*[cite: 3] */}
                      No logged actions for this target date. {/*[cite: 3] */}
                    </div> //[cite: 3]
                  )} {/*[cite: 3] */}
                </div> {/*[cite: 3] */}

                {/* Right Chevron Button */}
                {logs.length > 1 && ( //[cite: 3]
                  <button  //[cite: 3]
                    onClick={() => scrollCarousel('right')} //[cite: 3]
                    className={`absolute right-3 z-30 w-10 h-10 rounded-full flex items-center justify-center border shadow-md transition-all cursor-pointer ${ //[cite: 3]
                      isDarkMode  //[cite: 3]
                        ? 'bg-zinc-800/90 border-zinc-700 text-zinc-200 hover:bg-rose-600 hover:border-rose-600 hover:text-white'  //[cite: 3]
                        : 'bg-white/90 border-slate-300 text-slate-700 hover:bg-rose-500 hover:border-rose-500 hover:text-white' //[cite: 3]
                    }`} //[cite: 3]
                    title="Scroll Right" //[cite: 3]
                  > {/*[cite: 3] */}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"> {/*[cite: 3] */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /> {/*[cite: 3] */}
                    </svg> {/*[cite: 3] */}
                  </button> //[cite: 3]
                )} {/*[cite: 3] */}
              </div> {/*[cite: 3] */}
            </div> {/*[cite: 3] */}
          </div> //[cite: 3]
        ); //[cite: 3]
      })()} {/*[cite: 3] */}
    </div> //[cite: 3]
  ); //[cite: 3]
} //[cite: 3]

export default App; //[cite: 3]
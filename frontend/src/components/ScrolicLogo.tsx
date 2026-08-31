import React from 'react';

interface ScrolicLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showText?: boolean;
  withBackground?: boolean;
  pulseLive?: boolean;
}

export const ScrolicLogo: React.FC<ScrolicLogoProps> = ({
  size = 'md',
  className = '',
  showText = false,
  withBackground = true,
  pulseLive = false
}) => {
  // Dimension calculation
  let pxSize = 32;
  if (typeof size === 'number') {
    pxSize = size;
  } else {
    switch (size) {
      case 'xs': pxSize = 20; break;
      case 'sm': pxSize = 26; break;
      case 'md': pxSize = 34; break;
      case 'lg': pxSize = 48; break;
      case 'xl': pxSize = 72; break;
    }
  }

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <div 
        className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: pxSize, height: pxSize }}
      >
        <svg 
          viewBox="0 0 512 512" 
          width={pxSize} 
          height={pxSize}
          className="w-full h-full drop-shadow-md"
        >
          <defs>
            <linearGradient id="scrolicBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e7343"/>
              <stop offset="45%" stopColor="#18633c"/>
              <stop offset="100%" stopColor="#114e2e"/>
            </linearGradient>
            
            <linearGradient id="ribbonTop" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="70%" stopColor="#edf4f0"/>
              <stop offset="100%" stopColor="#d1ddd6"/>
            </linearGradient>
            
            <linearGradient id="ribbonBottom" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="60%" stopColor="#f0f6f3"/>
              <stop offset="100%" stopColor="#c6d4cd"/>
            </linearGradient>
            
            <linearGradient id="ribbonShade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#b0c4ba"/>
              <stop offset="100%" stopColor="#ebf2ee"/>
            </linearGradient>

            <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#052614" floodOpacity="0.6"/>
            </filter>
          </defs>

          {/* Green Background Box */}
          {withBackground && (
            <rect 
              width="512" 
              height="512" 
              rx="110" 
              fill="url(#scrolicBg)"
            />
          )}

          {/* 3 Candlesticks inside S */}
          <g>
            {/* Left Candlestick */}
            <line x1="228" y1="216" x2="228" y2="300" stroke="#ffffff" strokeWidth="6" strokeLinecap="round"/>
            <rect x="220" y="234" width="16" height="46" rx="8" fill="#ffffff"/>

            {/* Middle Candlestick */}
            <line x1="256" y1="194" x2="256" y2="322" stroke="#ffffff" strokeWidth="7" strokeLinecap="round"/>
            <rect x="247" y="208" width="18" height="96" rx="9" fill="#ffffff"/>

            {/* Right Candlestick */}
            <line x1="284" y1="230" x2="284" y2="304" stroke="#ffffff" strokeWidth="6" strokeLinecap="round"/>
            <rect x="276" y="242" width="16" height="44" rx="8" fill="#ffffff"/>
          </g>

          {/* 3D Ribbon S Shape */}
          <g filter="url(#logoShadow)">
            {/* Top Loop */}
            <path 
              d="M 368 100 C 275 92 145 130 134 235 C 128 290 178 305 208 295 C 170 280 162 238 184 195 C 214 135 305 132 368 100 Z" 
              fill="url(#ribbonTop)" 
            />
            {/* Top Shade Sweep */}
            <path 
              d="M 368 100 C 320 120 220 130 180 205 C 165 235 175 270 208 295 C 185 285 160 255 170 215 C 185 155 285 118 368 100 Z" 
              fill="url(#ribbonShade)" 
              opacity="0.85" 
            />
            {/* Bottom Loop */}
            <path 
              d="M 144 412 C 237 420 367 382 378 277 C 384 222 334 207 304 217 C 342 232 350 274 328 317 C 298 377 207 380 144 412 Z" 
              fill="url(#ribbonBottom)" 
            />
            {/* Bottom Shade Sweep */}
            <path 
              d="M 144 412 C 192 392 292 382 332 307 C 347 277 337 242 304 217 C 327 227 352 257 342 297 C 327 357 227 394 144 412 Z" 
              fill="url(#ribbonShade)" 
              opacity="0.85" 
            />
          </g>
        </svg>
      </div>

      {showText && (
        <div className="flex items-center gap-1.5 leading-none">
          <span className="font-display font-black tracking-tight text-white text-base">
            SCROLIC
          </span>
          {pulseLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
          )}
        </div>
      )}
    </div>
  );
};

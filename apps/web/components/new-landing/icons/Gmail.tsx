interface GmailProps {
  width?: string | number;
  height?: string | number;
}

export function Gmail({ width = "26", height = "23" }: GmailProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 26 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g filter="url(#filter0_d_265_2047)">
        <path
          d="M5.19216 16.4555H7.97378V9.52557L4 6.46823V15.2326C4 15.9083 4.53348 16.4556 5.19216 16.4556V16.4555Z"
          fill="#4285F4"
        />
        <path
          d="M17.5117 16.4555H20.2934C20.952 16.4555 21.4855 15.9082 21.4855 15.2326V6.46823L17.5117 9.52557V16.4555Z"
          fill="#34A853"
        />
        <path
          d="M17.5117 4.22622V9.52559L21.4855 6.46826V4.8377C21.4855 3.32635 19.8036 2.46317 18.6244 3.37018L17.5117 4.22622Z"
          fill="#FBBC04"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.97461 9.52557V4.2262L12.7431 7.89501L17.5116 4.2262V9.52557L12.7431 13.1944L7.97461 9.52557Z"
          fill="#EA4335"
        />
        <path
          d="M4 4.8377V6.46826L7.97378 9.52559V4.22622L6.86112 3.37018C5.68187 2.46317 4 3.32635 4 4.83763V4.8377Z"
          fill="#C5221F"
        />
      </g>
      <defs>
        <filter
          id="filter0_d_265_2047"
          x="0"
          y="1"
          width="25.4863"
          height="21.4556"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="2" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_265_2047"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_265_2047"
            result="shape"
          />
        </filter>
      </defs>
    </svg>
  );
}

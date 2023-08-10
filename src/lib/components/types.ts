import type { HTMLAttributes, HTMLButtonAttributes, SVGAttributes } from 'svelte/elements';

/** Button */
export interface ButtonProps extends HTMLButtonAttributes {
  text?: string | number | null;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'solo' | 'icon';
  /** @deprecated - Use `text` instead. */
  label?: string;
  href?: string;
  fixedTo?: string;
  /** @deprecated - Use `iconProps` instead. */
  icon?: IconName | undefined;
  iconProps?: IconProps;
  /** Used for control DOM element from outside */
  forwardRef?: HTMLButtonElement | HTMLAnchorElement;
  disabled?: boolean;
  isSubmitBtn?: boolean;
  forwardAction?: any;
  onClick?: (e?: Event) => void;
  getRef?: () => ButtonProps['forwardRef'];
}

/** Icon */
export interface IconProps extends SVGAttributes<SVGElement> {
  name: IconName;
  isOutlined?: boolean;
  colorInherit?: boolean;
}

export interface IconSourceProps extends Omit<IconProps, 'name'> {
  src: { solid?: IconThemeSource } & { default: IconThemeSource };
}

type IconThemeSource = {
  a: { [attribute: string]: string };
} & {
  [tag in AllowedTags]?: Array<{ [attribute: string]: string }>;
};

type AllowedTags = 'path' | 'circle' | 'rect' | 'polygon' | 'polyline' | 'line';

/** Add names of icons you use (or include) here (for stricter typing and intellisense [name suggestions]). */
export type IconName =
  | 'arrow-path'
  | 'x-circle'
  | 'check-circle'
  | 'github'
  | 'exclamation-triangle'
  | 'hand-thumb-up'
  | 'hand-thumb-down'
  | 'arrow-right-on-rectangle'
  | '';

/** Toggle */
export interface ToggleProps extends HTMLAttributes<HTMLSpanElement> {
  leftButtonProps?: ButtonProps;
  rightButtonProps?: ButtonProps;
  activeButton?: 'left' | 'right';
  isReactionToggle?: boolean;
}

/** Snackbar */
export type SnackbarStatus = 'successful' | 'pending' | 'failed';

/** Card */
export interface CardProps {
  isReadonly?: boolean;
  isAdmin?: boolean;
  loading?: boolean;
  data: {
    hrs: number;
    experience: 'Positive' | 'Negative';
    approved: 'Yes' | 'No' | 'Pending';
  };
  onSubmit?: (
    data: CardProps['data'],
    loading?: boolean
  ) => (e?: Event | undefined) => Promise<void>;
}

'use client';

import {
  Activity as ActivityGlyph,
  AppWindow as AppWindowGlyph,
  AntennaSignal as AntennaSignalGlyph,
  ArrowDown as ArrowDownGlyph,
  ArrowRight as ArrowRightGlyph,
  ArrowSeparateVertical as ArrowSeparateVerticalGlyph,
  ArrowUnionVertical as ArrowUnionVerticalGlyph,
  ArrowUp as ArrowUpGlyph,
  Attachment as AttachmentGlyph,
  BoxIso as BoxIsoGlyph,
  BookStack as BookStackGlyph,
  Brain as BrainGlyph,
  BrainElectricity as BrainElectricityGlyph,
  Camera as CameraGlyph,
  CableTag as CableTagGlyph,
  ChatBubble as ChatBubbleGlyph,
  Check as CheckGlyph,
  CheckCircle as CheckCircleGlyph,
  Circle as CircleGlyph,
  Clock as ClockGlyph,
  ClockRotateRight as ClockRotateRightGlyph,
  Cloud as CloudGlyph,
  Code as CodeGlyph,
  CodeBrackets as CodeBracketsGlyph,
  CodeBracketsSquare as CodeBracketsSquareGlyph,
  ControlSlider as ControlSliderGlyph,
  Copy as CopyGlyph,
  CornerBottomLeft as CornerBottomLeftGlyph,
  Compass as CompassGlyph,
  Computer as ComputerGlyph,
  CursorPointer as CursorPointerGlyph,
  DataTransferBoth as DataTransferBothGlyph,
  Database as DatabaseGlyph,
  DesignNib as DesignNibGlyph,
  DocMagnifyingGlass as DocMagnifyingGlassGlyph,
  Download as DownloadGlyph,
  DownloadSquare as DownloadSquareGlyph,
  Drag as DragGlyph,
  DragHandGesture as DragHandGestureGlyph,
  EditPencil as EditPencilGlyph,
  Enlarge as EnlargeGlyph,
  Eye as EyeGlyph,
  EyeClosed as EyeClosedGlyph,
  Flash as FlashGlyph,
  FloppyDisk as FloppyDiskGlyph,
  Folder as FolderGlyph,
  Frame as FrameGlyph,
  FrameSelect as FrameSelectGlyph,
  GitBranch as GitBranchGlyph,
  GitCompare as GitCompareGlyph,
  Hashtag as HashtagGlyph,
  Home as HomeGlyph,
  Globe as GlobeGlyph,
  InfoCircle as InfoCircleGlyph,
  KeyCommand as KeyCommandGlyph,
  Link as LinkGlyph,
  LinkSlash as LinkSlashGlyph,
  List as ListGlyph,
  Lock as LockGlyph,
  Map as MapGlyph,
  Maximize as MaximizeGlyph,
  MediaImage as MediaImageGlyph,
  MediaVideoList as MediaVideoListGlyph,
  Microphone as MicrophoneGlyph,
  Minus as MinusGlyph,
  Movie as MovieGlyph,
  MoreHoriz as MoreHorizGlyph,
  MultiplePages as MultiplePagesGlyph,
  MultiplePagesPlus as MultiplePagesPlusGlyph,
  MusicDoubleNote as MusicDoubleNoteGlyph,
  NavArrowDown as NavArrowDownGlyph,
  NavArrowRight as NavArrowRightGlyph,
  NavArrowUp as NavArrowUpGlyph,
  Network as NetworkGlyph,
  OnePointCircle as OnePointCircleGlyph,
  OpenBook as OpenBookGlyph,
  OpenNewWindow as OpenNewWindowGlyph,
  Page as PageGlyph,
  PageDown as PageDownGlyph,
  PageUp as PageUpGlyph,
  Palette as PaletteGlyph,
  PasteClipboard as PasteClipboardGlyph,
  Pause as PauseGlyph,
  Pin as PinGlyph,
  PinSlash as PinSlashGlyph,
  Play as PlayGlyph,
  Playlist as PlaylistGlyph,
  Podcast as PodcastGlyph,
  Plus as PlusGlyph,
  PrecisionTool as PrecisionToolGlyph,
  Reduce as ReduceGlyph,
  RefreshDouble as RefreshDoubleGlyph,
  Repeat as RepeatGlyph,
  RepeatOnce as RepeatOnceGlyph,
  Search as SearchGlyph,
  Send as SendGlyph,
  Server as ServerGlyph,
  Settings as SettingsGlyph,
  SettingsProfiles as SettingsProfilesGlyph,
  ShareAndroid as ShareAndroidGlyph,
  ShieldCheck as ShieldCheckGlyph,
  Shuffle as ShuffleGlyph,
  SidebarCollapse as SidebarCollapseGlyph,
  SidebarExpand as SidebarExpandGlyph,
  SkipNext as SkipNextGlyph,
  SkipPrev as SkipPrevGlyph,
  SoundHigh as SoundHighGlyph,
  SoundLow as SoundLowGlyph,
  SoundOff as SoundOffGlyph,
  Sparks as SparksGlyph,
  Square as SquareGlyph,
  SwitchOff as SwitchOffGlyph,
  SwitchOn as SwitchOnGlyph,
  SystemShut as SystemShutGlyph,
  TableRows as TableRowsGlyph,
  Terminal as TerminalGlyph,
  TerminalTag as TerminalTagGlyph,
  Text as TextGlyph,
  Trash as TrashGlyph,
  Type as TypeGlyph,
  Undo as UndoGlyph,
  Upload as UploadGlyph,
  ViewColumns2 as ViewColumns2Glyph,
  ViewGrid as ViewGridGlyph,
  WarningCircle as WarningCircleGlyph,
  WarningTriangle as WarningTriangleGlyph,
  MagicWand as MagicWandGlyph,
  PathArrow as PathArrowGlyph,
  Wrench as WrenchGlyph,
  Xmark as XGlyph,
  XmarkCircle as XmarkCircleGlyph,
} from 'iconoir-react';
import * as React from 'react';
import {
  forwardRef,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SVGProps,
} from 'react';

/**
 * Hudson's semantic icon boundary.
 *
 * Iconoir keeps the package footprint small and uses a lighter 1.5px stroke.
 * The adapter preserves Hudson's existing size prop and component contract so
 * icon choices stay centralized and the underlying set remains replaceable.
 */
export interface HudsonIconProps extends SVGProps<SVGSVGElement> {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
}

export type HudsonIcon = ForwardRefExoticComponent<
  HudsonIconProps & RefAttributes<SVGSVGElement>
>;

type IconoirGlyph = ForwardRefExoticComponent<
  Omit<SVGProps<SVGSVGElement>, 'ref'> & RefAttributes<SVGSVGElement>
>;

interface IconOptions {
  mirror?: boolean;
}

function hudsonIcon(Glyph: IconoirGlyph, displayName: string, options: IconOptions = {}): HudsonIcon {
  const Icon = forwardRef<SVGSVGElement, HudsonIconProps>(function HudsonIcon(
    {
      size = 24,
      width,
      height,
      strokeWidth = 1.5,
      absoluteStrokeWidth = false,
      style,
      ...props
    },
    ref,
  ) {
    const resolvedStrokeWidth =
      absoluteStrokeWidth && typeof size === 'number' && typeof strokeWidth === 'number'
        ? (strokeWidth * 24) / size
        : strokeWidth;
    const resolvedStyle: CSSProperties | undefined = options.mirror
      ? { ...style, transform: `scaleX(-1) ${style?.transform ?? ''}`.trim() }
      : style;

    return (
      <Glyph
        {...props}
        ref={ref}
        width={width ?? size}
        height={height ?? size}
        strokeWidth={resolvedStrokeWidth}
        style={resolvedStyle}
      />
    );
  });

  Icon.displayName = displayName;
  return Icon;
}

export const Activity = hudsonIcon(ActivityGlyph, 'Activity');
export const AlertCircle = hudsonIcon(WarningCircleGlyph, 'AlertCircle');
export const AlertTriangle = hudsonIcon(WarningTriangleGlyph, 'AlertTriangle');
export const AppWindow = hudsonIcon(AppWindowGlyph, 'AppWindow');
export const ArrowDown = hudsonIcon(ArrowDownGlyph, 'ArrowDown');
export const ArrowRight = hudsonIcon(ArrowRightGlyph, 'ArrowRight');
export const ArrowUp = hudsonIcon(ArrowUpGlyph, 'ArrowUp');
export const ArrowUpDown = hudsonIcon(DataTransferBothGlyph, 'ArrowUpDown');
export const AudioLines = hudsonIcon(SoundHighGlyph, 'AudioLines');
export const BookOpen = hudsonIcon(OpenBookGlyph, 'BookOpen');
export const BookOpenText = hudsonIcon(OpenBookGlyph, 'BookOpenText');
export const Bot = hudsonIcon(BrainElectricityGlyph, 'Bot');
export const Boxes = hudsonIcon(BoxIsoGlyph, 'Boxes');
export const Braces = hudsonIcon(CodeBracketsGlyph, 'Braces');
export const Brackets = hudsonIcon(CodeBracketsSquareGlyph, 'Brackets');
export const Brain = hudsonIcon(BrainGlyph, 'Brain');
export const Camera = hudsonIcon(CameraGlyph, 'Camera');
export const Cable = hudsonIcon(CableTagGlyph, 'Cable');
export const Check = hudsonIcon(CheckGlyph, 'Check');
export const CheckCircle2 = hudsonIcon(CheckCircleGlyph, 'CheckCircle2');
export const ChevronDown = hudsonIcon(NavArrowDownGlyph, 'ChevronDown');
export const ChevronRight = hudsonIcon(NavArrowRightGlyph, 'ChevronRight');
export const ChevronsDownUp = hudsonIcon(ArrowUnionVerticalGlyph, 'ChevronsDownUp');
export const ChevronsUpDown = hudsonIcon(ArrowSeparateVerticalGlyph, 'ChevronsUpDown');
export const ChevronUp = hudsonIcon(NavArrowUpGlyph, 'ChevronUp');
export const Circle = hudsonIcon(CircleGlyph, 'Circle');
export const CircleDot = hudsonIcon(OnePointCircleGlyph, 'CircleDot');
export const Clipboard = hudsonIcon(PasteClipboardGlyph, 'Clipboard');
export const Clock = hudsonIcon(ClockGlyph, 'Clock');
export const Cloud = hudsonIcon(CloudGlyph, 'Cloud');
export const Code2 = hudsonIcon(CodeGlyph, 'Code2');
export const Columns2 = hudsonIcon(ViewColumns2Glyph, 'Columns2');
export const Command = hudsonIcon(KeyCommandGlyph, 'Command');
export const Compass = hudsonIcon(CompassGlyph, 'Compass');
export const Copy = hudsonIcon(CopyGlyph, 'Copy');
export const CopyPlus = hudsonIcon(MultiplePagesPlusGlyph, 'CopyPlus');
export const CornerDownLeft = hudsonIcon(CornerBottomLeftGlyph, 'CornerDownLeft');
export const Crosshair = hudsonIcon(PrecisionToolGlyph, 'Crosshair');
export const Database = hudsonIcon(DatabaseGlyph, 'Database');
export const Download = hudsonIcon(DownloadGlyph, 'Download');
export const ExternalLink = hudsonIcon(OpenNewWindowGlyph, 'ExternalLink');
export const Eye = hudsonIcon(EyeGlyph, 'Eye');
export const EyeOff = hudsonIcon(EyeClosedGlyph, 'EyeOff');
export const FileCode2 = hudsonIcon(CodeBracketsSquareGlyph, 'FileCode2');
export const FileDiff = hudsonIcon(GitCompareGlyph, 'FileDiff');
export const FileText = hudsonIcon(PageGlyph, 'FileText');
export const Film = hudsonIcon(MovieGlyph, 'Film');
export const Focus = hudsonIcon(FrameSelectGlyph, 'Focus');
export const Folder = hudsonIcon(FolderGlyph, 'Folder');
export const FrameIcon = hudsonIcon(FrameGlyph, 'FrameIcon');
export const GitBranchPlus = hudsonIcon(GitBranchGlyph, 'GitBranchPlus');
export const GripVertical = hudsonIcon(DragGlyph, 'GripVertical');
export const GripHorizontal = hudsonIcon(DragGlyph, 'GripHorizontal');
export const Globe = hudsonIcon(GlobeGlyph, 'Globe');
export const Hand = hudsonIcon(DragHandGestureGlyph, 'Hand');
export const Hash = hudsonIcon(HashtagGlyph, 'Hash');
export const History = hudsonIcon(ClockRotateRightGlyph, 'History');
export const Home = hudsonIcon(HomeGlyph, 'Home');
export const ImageIcon = hudsonIcon(MediaImageGlyph, 'ImageIcon');
export const Image = hudsonIcon(MediaImageGlyph, 'Image');
export const Inbox = hudsonIcon(DownloadSquareGlyph, 'Inbox');
export const Info = hudsonIcon(InfoCircleGlyph, 'Info');
export const Keyboard = hudsonIcon(TypeGlyph, 'Keyboard');
export const Layers = hudsonIcon(MultiplePagesGlyph, 'Layers');
export const Layers3 = hudsonIcon(MultiplePagesGlyph, 'Layers3');
export const LayoutGrid = hudsonIcon(ViewGridGlyph, 'LayoutGrid');
export const Grid3X3 = hudsonIcon(ViewGridGlyph, 'Grid3X3');
export const LayoutList = hudsonIcon(ListGlyph, 'LayoutList');
export const LayoutTemplate = hudsonIcon(ViewGridGlyph, 'LayoutTemplate');
export const Library = hudsonIcon(BookStackGlyph, 'Library');
export const Link2 = hudsonIcon(LinkGlyph, 'Link2');
export const List = hudsonIcon(ListGlyph, 'List');
export const ListMusic = hudsonIcon(PlaylistGlyph, 'ListMusic');
export const Loader2 = hudsonIcon(RefreshDoubleGlyph, 'Loader2');
export const LoaderCircle = hudsonIcon(RefreshDoubleGlyph, 'LoaderCircle');
export const Lock = hudsonIcon(LockGlyph, 'Lock');
export const LockKeyhole = hudsonIcon(LockGlyph, 'LockKeyhole');
export const Map = hudsonIcon(MapGlyph, 'Map');
export const Maximize = hudsonIcon(MaximizeGlyph, 'Maximize');
export const Maximize2 = hudsonIcon(EnlargeGlyph, 'Maximize2');
export const MessageSquare = hudsonIcon(ChatBubbleGlyph, 'MessageSquare');
export const Mic = hudsonIcon(MicrophoneGlyph, 'Mic');
export const Minimize2 = hudsonIcon(ReduceGlyph, 'Minimize2');
export const Minus = hudsonIcon(MinusGlyph, 'Minus');
export const MousePointer2 = hudsonIcon(CursorPointerGlyph, 'MousePointer2');
export const Monitor = hudsonIcon(ComputerGlyph, 'Monitor');
export const MoreHorizontal = hudsonIcon(MoreHorizGlyph, 'MoreHorizontal');
export const Move = hudsonIcon(DragGlyph, 'Move');
export const Music2 = hudsonIcon(MusicDoubleNoteGlyph, 'Music2');
export const Network = hudsonIcon(NetworkGlyph, 'Network');
export const PanelLeft = hudsonIcon(SidebarExpandGlyph, 'PanelLeft');
export const PanelLeftClose = hudsonIcon(SidebarCollapseGlyph, 'PanelLeftClose');
export const PanelLeftOpen = hudsonIcon(SidebarExpandGlyph, 'PanelLeftOpen');
export const PanelBottom = hudsonIcon(PageDownGlyph, 'PanelBottom');
export const PanelRightClose = hudsonIcon(SidebarCollapseGlyph, 'PanelRightClose', { mirror: true });
export const PanelRightOpen = hudsonIcon(SidebarExpandGlyph, 'PanelRightOpen', { mirror: true });
export const PanelTop = hudsonIcon(PageUpGlyph, 'PanelTop');
export const PanelsTopLeft = hudsonIcon(ViewGridGlyph, 'PanelsTopLeft');
export const Paintbrush = hudsonIcon(DesignNibGlyph, 'Paintbrush');
export const Palette = hudsonIcon(PaletteGlyph, 'Palette');
export const Paperclip = hudsonIcon(AttachmentGlyph, 'Paperclip');
export const Pause = hudsonIcon(PauseGlyph, 'Pause');
export const Pencil = hudsonIcon(EditPencilGlyph, 'Pencil');
export const PictureInPicture2 = hudsonIcon(MediaVideoListGlyph, 'PictureInPicture2');
export const Pin = hudsonIcon(PinGlyph, 'Pin');
export const PinOff = hudsonIcon(PinSlashGlyph, 'PinOff');
export const Play = hudsonIcon(PlayGlyph, 'Play');
export const Plus = hudsonIcon(PlusGlyph, 'Plus');
export const Power = hudsonIcon(SystemShutGlyph, 'Power');
export const Radar = hudsonIcon(AntennaSignalGlyph, 'Radar');
export const Radio = hudsonIcon(PodcastGlyph, 'Radio');
export const Repeat = hudsonIcon(RepeatGlyph, 'Repeat');
export const Repeat1 = hudsonIcon(RepeatOnceGlyph, 'Repeat1');
export const RotateCcw = hudsonIcon(UndoGlyph, 'RotateCcw');
export const Rows3 = hudsonIcon(TableRowsGlyph, 'Rows3');
export const Save = hudsonIcon(FloppyDiskGlyph, 'Save');
export const ScanSearch = hudsonIcon(DocMagnifyingGlassGlyph, 'ScanSearch');
export const Search = hudsonIcon(SearchGlyph, 'Search');
export const Send = hudsonIcon(SendGlyph, 'Send');
export const Server = hudsonIcon(ServerGlyph, 'Server');
export const Settings = hudsonIcon(SettingsGlyph, 'Settings');
export const Settings2 = hudsonIcon(SettingsProfilesGlyph, 'Settings2');
export const Share2 = hudsonIcon(ShareAndroidGlyph, 'Share2');
export const ShieldCheck = hudsonIcon(ShieldCheckGlyph, 'ShieldCheck');
export const Shuffle = hudsonIcon(ShuffleGlyph, 'Shuffle');
export const SkipBack = hudsonIcon(SkipPrevGlyph, 'SkipBack');
export const SkipForward = hudsonIcon(SkipNextGlyph, 'SkipForward');
export const Sliders = hudsonIcon(ControlSliderGlyph, 'Sliders');
export const SlidersHorizontal = hudsonIcon(ControlSliderGlyph, 'SlidersHorizontal');
export const Sparkles = hudsonIcon(SparksGlyph, 'Sparkles');
export const Square = hudsonIcon(SquareGlyph, 'Square');
export const Terminal = hudsonIcon(TerminalGlyph, 'Terminal');
export const TerminalSquare = hudsonIcon(TerminalTagGlyph, 'TerminalSquare');
export const Text = hudsonIcon(TextGlyph, 'Text');
export const ToggleLeft = hudsonIcon(SwitchOffGlyph, 'ToggleLeft');
export const ToggleRight = hudsonIcon(SwitchOnGlyph, 'ToggleRight');
export const Trash2 = hudsonIcon(TrashGlyph, 'Trash2');
export const Type = hudsonIcon(TypeGlyph, 'Type');
export const Unlink = hudsonIcon(LinkSlashGlyph, 'Unlink');
export const Upload = hudsonIcon(UploadGlyph, 'Upload');
export const Volume1 = hudsonIcon(SoundLowGlyph, 'Volume1');
export const Volume2 = hudsonIcon(SoundHighGlyph, 'Volume2');
export const VolumeX = hudsonIcon(SoundOffGlyph, 'VolumeX');
export const Wrench = hudsonIcon(WrenchGlyph, 'Wrench');
export const SwatchBook = hudsonIcon(PaletteGlyph, 'SwatchBook');
export const Wand2 = hudsonIcon(MagicWandGlyph, 'Wand2');
export const Waypoints = hudsonIcon(PathArrowGlyph, 'Waypoints');
export const Workflow = hudsonIcon(NetworkGlyph, 'Workflow');
export const X = hudsonIcon(XGlyph, 'X');
export const XCircle = hudsonIcon(XmarkCircleGlyph, 'XCircle');
export const Zap = hudsonIcon(FlashGlyph, 'Zap');

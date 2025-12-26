import {
  ref,
  watch,
  nextTick,
  reactive,
  onMounted,
  defineComponent,
  type PropType,
  type CSSProperties,
  type ExtractPropTypes,
  type TeleportProps,
} from 'vue';

// Utils
import {
  pick,
  clamp,
  truthProp,
  unknownProp,
  Interceptor,
  windowWidth,
  windowHeight,
  makeArrayProp,
  makeStringProp,
  makeNumericProp,
  callInterceptor,
  createNamespace,
  HAPTICS_FEEDBACK,
} from '../utils';

// Composables
import { useRect } from '@vant/use';
import { useExpose } from '../composables/use-expose';

// Components
import { Icon } from '../icon';
import { Swipe, SwipeInstance, SwipeToOptions } from '../swipe';
import { Popup, PopupCloseIconPosition } from '../popup';
import ImagePreviewItem from './ImagePreviewItem';

// Types
import {
  ImagePreviewScaleEventParams,
  ImagePreviewItemInstance,
} from './types';

const [name, bem] = createNamespace('image-preview');

const popupProps = [
  'show',
  'teleport',
  'transition',
  'closeOnPopstate',
] as const;

export const imagePreviewProps = {
  show: Boolean,
  loop: truthProp,
  images: makeArrayProp<string>(),
  minZoom: makeNumericProp(1 / 3),
  maxZoom: makeNumericProp(3),
  overlay: truthProp,
  vertical: Boolean,
  closeable: Boolean,
  showIndex: truthProp,
  className: unknownProp,
  closeIcon: makeStringProp('clear'),
  transition: String,
  beforeClose: Function as PropType<Interceptor>,
  doubleScale: truthProp,
  overlayClass: unknownProp,
  overlayStyle: Object as PropType<CSSProperties>,
  swipeDuration: makeNumericProp(300),
  startPosition: makeNumericProp(0),
  showIndicators: Boolean,
  closeOnPopstate: truthProp,
  closeOnClickImage: truthProp,
  closeOnClickOverlay: truthProp,
  closeOnSwipeDown: truthProp,
  closeIconPosition: makeStringProp<PopupCloseIconPosition>('top-right'),
  teleport: [String, Object] as PropType<TeleportProps['to']>,
};

export type ImagePreviewProps = ExtractPropTypes<typeof imagePreviewProps>;

export default defineComponent({
  name,

  props: imagePreviewProps,

  emits: ['scale', 'close', 'closed', 'change', 'longPress', 'update:show'],

  setup(props, { emit, slots }) {
    const swipeRef = ref<SwipeInstance>();
    const activedPreviewItemRef = ref<ImagePreviewItemInstance>();
    const currentOverlayStyle = ref<CSSProperties>();

    const state = reactive({
      active: 0,
      rootWidth: 0,
      rootHeight: 0,
      disableZoom: false,
    });

    const resize = () => {
      if (swipeRef.value) {
        const rect = useRect(swipeRef.value.$el);
        state.rootWidth = rect.width;
        state.rootHeight = rect.height;
        swipeRef.value.resize();
      }
    };

    const emitScale = (args: ImagePreviewScaleEventParams) =>
      emit('scale', args);

    const onDrag = ({ moveY }: { moveY: number }) => {
      if (state.rootHeight > 0) {
        const opacity = clamp(1 - moveY / state.rootHeight, 0, 1);
        currentOverlayStyle.value = { opacity };
      }
    };

    const updateShow = (show: boolean) => emit('update:show', show);

    const emitClose = () => {
      callInterceptor(props.beforeClose, {
        args: [state.active],
        done: () => updateShow(false),
      });
    };

    const setActive = (active: number) => {
      if (active !== state.active) {
        state.active = active;
        emit('change', active);
      }
    };

    const renderIndex = () => {
      if (props.showIndex) {
        return (
          <div class={bem('index')}>
            {slots.index
              ? slots.index({ index: state.active })
              : `${state.active + 1} / ${props.images.length}`}
          </div>
        );
      }
    };

    const renderCover = () => {
      if (slots.cover) {
        return <div class={bem('cover')}>{slots.cover()}</div>;
      }
    };

    const onDragStart = () => {
      state.disableZoom = true;
    };

    const onDragEnd = () => {
      state.disableZoom = false;
    };

    const renderImages = () => (
      <Swipe
        ref={swipeRef}
        lazyRender
        loop={props.loop}
        class={bem('swipe')}
        vertical={props.vertical}
        duration={props.swipeDuration}
        initialSwipe={props.startPosition}
        showIndicators={props.showIndicators}
        indicatorColor="white"
        onChange={setActive}
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
      >
        {props.images.map((image, index) => (
          <ImagePreviewItem
            v-slots={{
              image: slots.image,
            }}
            ref={(item) => {
              if (index === state.active) {
                activedPreviewItemRef.value = item as ImagePreviewItemInstance;
              }
            }}
            src={image}
            show={props.show}
            active={state.active}
            maxZoom={props.maxZoom}
            minZoom={props.minZoom}
            rootWidth={state.rootWidth}
            rootHeight={state.rootHeight}
            disableZoom={state.disableZoom}
            doubleScale={props.doubleScale}
            closeOnClickImage={props.closeOnClickImage}
            closeOnClickOverlay={props.closeOnClickOverlay}
            closeOnSwipeDown={props.closeOnSwipeDown}
            vertical={props.vertical}
            onClose={emitClose}
            onDrag={onDrag}
            onLongPress={() => emit('longPress', { index })}
            onScale={emitScale}
          />
        ))}
      </Swipe>
    );

    const renderClose = () => {
      if (props.closeable) {
        return (
          <Icon
            role="button"
            name={props.closeIcon}
            class={[
              bem('close-icon', props.closeIconPosition),
              HAPTICS_FEEDBACK,
            ]}
            onClick={emitClose}
          />
        );
      }
    };

    const onClosed = () => {
      emit('closed');
      currentOverlayStyle.value = {};
    };

    const swipeTo = (index: number, options?: SwipeToOptions) =>
      swipeRef.value?.swipeTo(index, options);

    useExpose({
      resetScale: () => {
        activedPreviewItemRef.value?.resetScale();
      },
      swipeTo,
    });

    onMounted(resize);

    watch([windowWidth, windowHeight], resize);

    watch(
      () => props.startPosition,
      (value) => setActive(+value),
    );

    watch(
      () => props.show,
      (value) => {
        const { images, startPosition } = props;
        if (value) {
          setActive(+startPosition);
          nextTick(() => {
            resize();
            swipeTo(+startPosition, { immediate: true });
          });
        } else {
          emit('close', {
            index: state.active,
            url: images[state.active],
          });
        }
      },
    );

    // <Popup
    //     class={[bem(), props.className]}
    //     overlayClass={[bem('overlay'), props.overlayClass]}
    //     overlayStyle={{ ...props.overlayStyle, ...currentOverlayStyle.value }}
    //     onClosed={onClosed}
    //     onUpdate:show={updateShow}
    //     {...pick(props, popupProps)}
    //   >
    //     {renderClose()}
    //     {renderImages()}
    //     {renderIndex()}
    //     {renderCover()}
    //   </Popup>

    return () => (
      <Popup
        class={[bem(), props.className]}
        overlayClass={[bem('overlay'), props.overlayClass]}
        onClosed={onClosed}
        onUpdate:show={updateShow}
        {...pick(props, popupProps)}
      >
        {renderClose()}
        {renderImages()}
        {renderIndex()}
        {renderCover()}
      </Popup>
    );
  },
});

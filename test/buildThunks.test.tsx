import { configureStore } from '@reduxjs/toolkit';
import { createApi } from '@rtk-incubator/rtk-query/react';

import { renderHook } from '@testing-library/react-hooks';
import { withProvider } from './helpers';

test('handles a non-async baseQuery without error', async () => {
  const baseQuery = (args?: any) => ({ data: args });
  const api = createApi({
    baseQuery,
    endpoints: (build) => ({
      getUser: build.query<unknown, number>({
        query(id) {
          return { url: `user/${id}` };
        },
      }),
    }),
  });
  const { getUser } = api.endpoints;
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
    },
    middleware: (gDM) => gDM().concat(api.middleware),
  });

  const promise = store.dispatch(getUser.initiate(1));
  const { data } = await promise;

  expect(data).toEqual({
    url: 'user/1',
  });

  const storeResult = getUser.select(1)(store.getState());
  expect(storeResult).toEqual({
    data: {
      url: 'user/1',
    },
    endpoint: 'getUser',
    internalQueryArgs: {
      url: 'user/1',
    },
    isError: false,
    isLoading: false,
    isSuccess: true,
    isUninitialized: false,
    originalArgs: 1,
    requestId: expect.any(String),
    status: 'fulfilled',
    startedTimeStamp: expect.any(Number),
    fulfilledTimeStamp: expect.any(Number),
  });
});

describe('re-triggering behavior on arg change', () => {
  const api = createApi({
    baseQuery: () => ({ data: undefined }),
    endpoints: (build) => ({
      getUser: build.query<any, any>({
        query: (obj) => obj,
      }),
    }),
  });
  const { getUser } = api.endpoints;
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });

  const spy = jest.spyOn(getUser, 'initiate');
  beforeEach(() => void spy.mockClear());

  test('re-trigger on literal value change', async () => {
    const { result, rerender, waitForNextUpdate } = renderHook((props) => getUser.useQuery(props), {
      wrapper: withProvider(store),
      initialProps: 5,
    });

    while (result.current.status === 'pending') {
      await waitForNextUpdate();
    }
    expect(spy).toHaveBeenCalledTimes(1);

    for (let x = 1; x < 3; x++) {
      rerender(6);
      // @ts-ignore
      while (result.current.status === 'pending') {
        await waitForNextUpdate();
      }
      expect(spy).toHaveBeenCalledTimes(2);
    }

    for (let x = 1; x < 3; x++) {
      rerender(7);
      // @ts-ignore
      while (result.current.status === 'pending') {
        await waitForNextUpdate();
      }
      expect(spy).toHaveBeenCalledTimes(3);
    }
  });

  test('only re-trigger on shallow-equal arg change', async () => {
    const { result, rerender, waitForNextUpdate } = renderHook((props) => getUser.useQuery(props), {
      wrapper: withProvider(store),
      initialProps: { name: 'Bob', likes: 'iceCream' },
    });

    while (result.current.status === 'pending') {
      await waitForNextUpdate();
    }
    expect(spy).toHaveBeenCalledTimes(1);

    for (let x = 1; x < 3; x++) {
      rerender({ name: 'Bob', likes: 'waffles' });
      // @ts-ignore
      while (result.current.status === 'pending') {
        await waitForNextUpdate();
      }
      expect(spy).toHaveBeenCalledTimes(2);
    }

    for (let x = 1; x < 3; x++) {
      rerender({ name: 'Alice', likes: 'waffles' });
      // @ts-ignore
      while (result.current.status === 'pending') {
        await waitForNextUpdate();
      }
      expect(spy).toHaveBeenCalledTimes(3);
    }
  });

  test('re-trigger every time on deeper value changes', async () => {
    const { result, rerender, waitForNextUpdate } = renderHook((props) => getUser.useQuery(props), {
      wrapper: withProvider(store),
      initialProps: { person: { name: 'Tim' } },
    });

    while (result.current.status === 'pending') {
      await waitForNextUpdate();
    }
    expect(spy).toHaveBeenCalledTimes(1);

    for (let x = 1; x < 3; x++) {
      rerender({ person: { name: 'Tim' } });
      // @ts-ignore
      while (result.current.status === 'pending') {
        await waitForNextUpdate();
      }
      expect(spy).toHaveBeenCalledTimes(x + 1);
    }
  });

  test('do not re-trigger if the order of keys change while maintaining the same values', async () => {
    const { result, rerender, waitForNextUpdate } = renderHook((props) => getUser.useQuery(props), {
      wrapper: withProvider(store),
      initialProps: { name: 'Tim', likes: 'Bananas' },
    });

    while (result.current.status === 'pending') {
      await waitForNextUpdate();
    }
    expect(spy).toHaveBeenCalledTimes(1);

    for (let x = 1; x < 3; x++) {
      rerender({ likes: 'Bananas', name: 'Tim' });
      // @ts-ignore
      while (result.current.status === 'pending') {
        await waitForNextUpdate();
      }
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});

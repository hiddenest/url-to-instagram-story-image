'use client';

import React, { useState } from 'react';
import { generateOGImage } from './actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const Page = () => {
  const [url, setUrl] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const data = await generateOGImage(url);
      setImageData(data);
    } catch (error) {
      console.error('Error generating OG image:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='grid md:grid-cols-2 items-center gap-4 mx-auto my-8 max-w-screen-md max-md:px-4'>
      <Card className='aspect-[9/16] bg-gray-100 overflow-hidden p-0'>
        {imageData && (
          <img
            src={imageData}
            alt='Generated OG Image'
            className='w-full h-auto'
          />
        )}
      </Card>

      <Card className='w-full max-w-2xl mx-auto'>
        <CardHeader>
          <CardTitle>URL to Instagram Story Image</CardTitle>
          <CardDescription>Enter a URL to generate an image</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <Input
              type='url'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='Enter URL'
              required
            />
            <Button type='submit' disabled={isLoading}>
              {isLoading ? 'Generating...' : 'Generate OG Image'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Page;
